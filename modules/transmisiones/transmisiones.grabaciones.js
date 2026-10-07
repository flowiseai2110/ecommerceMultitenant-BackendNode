import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { getStreamingProvider } from "../../services/streaming/index.js";
import { borrarPrivado, subirPrivado, urlPrivada } from "../../services/storage-privado.service.js";
import { sendTransmisionGrabacionEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { firmarTokenAnfitrion } from "./transmisiones.token.js";
import {
  PARTE_MIN_SEG, conGrabacion, descargaHasta, grabacionHasta, nombreArchivo, salaAbreEn, tocaAvisoBorrado, tocaAvisoDescarga
} from "./transmisiones.reglas.js";

/**
 * Grabación del plan Privado (Fase 4, R8.1): 30 días para ver y descargar, y
 * "Guardar 1 año" que alarga solo la descarga.
 *
 * Ciclo de vida de cada parte (Cloudflare crea un video por cada reconexión):
 *   registrada al terminar (antes de borrar la entrada) → procesando → lista
 *   → MP4 descargable pedido → MP4 listo → [Guardar 1 año: copia a R2 privado]
 *   → al vencer: se borra en Cloudflare (y en R2 al vencer el año).
 *
 * Mientras dura el plazo en línea, la descarga sale directo de Cloudflare
 * (MP4 firmado). Solo "Guardar 1 año" copia el archivo a R2: guardarlo un año
 * en Stream cuesta ~9 veces más (fase0.md).
 */

const MS_MIN = 60 * 1000;
const provider = () => getStreamingProvider();

const INCLUDE_T = {
  funcion: { select: { inicio: true, fin: true, evento: { select: { producto: { select: { nombre: true } } } } } },
  grabaciones: { orderBy: { orden: "asc" } }
};

/** Enlace del anfitrión: ver y descargar sin cuenta (storefront /:slug/grabacion/:token). */
export async function enlaceAnfitrion(t) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: t.tiendaId }, select: { slug: true } });
  const token = await firmarTokenAnfitrion({ transmisionId: t.id, tiendaId: t.tiendaId });
  return urlTienda(tienda.slug, `grabacion/${token}`);
}

/**
 * Al terminar, antes de borrar la entrada: guarda los videos grabados desde que
 * abrió la sala (los de la prueba ya se borraron). Idempotente (videoId único).
 */
export async function registrarGrabaciones(t, ahora = new Date()) {
  const desde = salaAbreEn(t.funcion).getTime();
  const videos = (await provider().listarVideos(t.entradaId))
    .filter(v => !v.creadoEn || v.creadoEn.getTime() >= desde)
    .sort((a, b) => (a.creadoEn?.getTime() ?? 0) - (b.creadoEn?.getTime() ?? 0));
  if (!videos.length) return 0;
  await prisma.transmision_grabaciones.createMany({
    data: videos.map((v, i) => ({
      tiendaId: t.tiendaId, transmisionId: t.id, videoId: v.id, orden: i + 1,
      grabadaEn: v.creadoEn ?? ahora, estado: v.estado, duracionSeg: v.duracionSeg
    })),
    skipDuplicates: true
  });
  return videos.length;
}

// ---------- Copia a R2 ("Guardar 1 año"), una a la vez y fuera del ciclo ----------

let copiando = false;

/** Copia en segundo plano: un MP4 de 3 h pesa ~7 GB y no debe frenar el corte de otras transmisiones. */
function copiarEnSegundoPlano(g, t) {
  if (copiando) return;
  copiando = true;
  (async () => {
    try {
      const url = await provider().urlDescarga(g.videoId, { expiraEn: new Date(Date.now() + 6 * 60 * MS_MIN) });
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`descarga del MP4: HTTP ${res.status}`);
      const key = `transmisiones/${t.tiendaId}/${t.id}/${g.videoId}.mp4`;
      await subirPrivado(key, res.body, "video/mp4");
      const bytes = Number(res.headers.get("content-length")) || null;
      await prisma.transmision_grabaciones.update({
        where: { id: g.id },
        data: { r2Key: key, r2Bytes: bytes ? BigInt(bytes) : null, r2CopiadaEn: new Date(), fechaActualizacion: new Date() }
      });
      logger.info(`Grabación ${g.videoId} copiada a R2 (${key})`);
    } catch (e) {
      logger.error(`No se copió la grabación ${g.videoId} a R2 (se reintenta): ${e.message}`);
    } finally {
      copiando = false;
    }
  })();
}

// ---------- Borrado ----------

async function borrarParteEnProveedor(g, ahora) {
  if (g.estado !== "borrada") await provider().borrarVideo(g.videoId);
  await prisma.transmision_grabaciones.update({ where: { id: g.id }, data: { estado: "borrada", borradaEn: ahora, fechaActualizacion: ahora } });
}

/** Borra todo (Cloudflare y R2) y marca la grabación como borrada. R9.3: también a pedido. */
export async function borrarGrabacion(t, ahora = new Date()) {
  const grabaciones = t.grabaciones ?? await prisma.transmision_grabaciones.findMany({ where: { transmisionId: t.id } });
  for (const g of grabaciones) {
    if (g.estado !== "borrada") await borrarParteEnProveedor(g, ahora);
    if (g.r2Key) {
      await borrarPrivado(g.r2Key);
      await prisma.transmision_grabaciones.update({ where: { id: g.id }, data: { r2Key: null, fechaActualizacion: ahora } });
    }
  }
  await prisma.evento_transmisiones.update({ where: { id: t.id }, data: { grabacionBorradaEn: ahora } });
}

// ---------- Avisos ----------

async function avisar(t, tipo, hasta, campo, ahora) {
  // Marca primero (idempotente entre réplicas) y luego envía.
  const marcado = await prisma.evento_transmisiones.updateMany({ where: { id: t.id, [campo]: null }, data: { [campo]: ahora } });
  if (marcado.count !== 1) return;
  const tienda = await prisma.tiendas.findUnique({ where: { id: t.tiendaId }, select: { nombre: true, email: true } });
  const to = [...new Set([t.anfitrionEmail, tienda?.email].filter(Boolean))];
  if (!to.length) return;
  await sendTransmisionGrabacionEmail({
    to, tipo, tiendaNombre: tienda.nombre, evento: t.funcion.evento.producto.nombre, enlace: await enlaceAnfitrion(t), hasta
  }).catch(e => logger.error(`No se envió el correo de grabación (${tipo}) de ${t.id}: ${e.message}`));
}

// ---------- Ciclo del job ----------

/**
 * Un ciclo (cada minuto):
 *  1. partes en proceso → listas (o descartadas si duran menos de 10 s);
 *  2. MP4 descargable: pedirlo y esperar que esté listo;
 *  3. aviso "tu grabación está lista" cuando todo está listo;
 *  4. "Guardar 1 año": copiar a R2 (en segundo plano, una a la vez);
 *  5. avisos 7 días antes de cada borrado y borrado al vencer.
 */
export async function cicloGrabaciones(ahora = new Date()) {
  // 1 y 2: partes pendientes de Cloudflare
  const pendientes = await prisma.transmision_grabaciones.findMany({
    where: { OR: [{ estado: "procesando" }, { estado: "lista", mp4Estado: { in: ["sin_pedir", "pendiente"] } }] },
    take: 30
  });
  for (const g of pendientes) {
    try {
      if (g.estado === "procesando") {
        const v = await provider().estadoVideo(g.videoId);
        if (v.estado === "lista" && (v.duracionSeg ?? 0) < PARTE_MIN_SEG) {
          await borrarParteEnProveedor(g, ahora); // un parpadeo de la señal, no una parte
          continue;
        }
        if (v.estado !== "procesando") {
          await prisma.transmision_grabaciones.update({
            where: { id: g.id }, data: { estado: v.estado, duracionSeg: v.duracionSeg, fechaActualizacion: ahora }
          });
        }
      } else if (g.mp4Estado === "sin_pedir") {
        const mp4 = await provider().pedirDescarga(g.videoId);
        await prisma.transmision_grabaciones.update({ where: { id: g.id }, data: { mp4Estado: mp4, fechaActualizacion: ahora } });
      } else {
        const mp4 = await provider().estadoDescarga(g.videoId);
        if (mp4 !== "pendiente") await prisma.transmision_grabaciones.update({ where: { id: g.id }, data: { mp4Estado: mp4, fechaActualizacion: ahora } });
      }
    } catch (e) {
      logger.warn(`Grabación ${g.videoId}: ${e.message}`);
    }
  }

  // 3 a 5: transmisiones terminadas con grabación vigente
  const conVideo = await prisma.evento_transmisiones.findMany({
    where: { plan: { not: "basico" }, grabar: true, grabacionBorradaEn: null, terminadaEn: { not: null }, estado: "programada", limpiadaEn: { not: null } },
    include: INCLUDE_T,
    take: 50
  });
  for (const t of conVideo) {
    try {
      const vivas = t.grabaciones.filter(g => g.estado !== "borrada");
      const enLinea = grabacionHasta(t, t.funcion);
      const descarga = descargaHasta(t, t.funcion);

      if (!t.avisoGrabacionEn && vivas.length && vivas.every(g => g.estado !== "procesando" && g.mp4Estado !== "sin_pedir" && g.mp4Estado !== "pendiente")
        && vivas.some(g => g.estado === "lista")) {
        await avisar(t, "lista", enLinea, "avisoGrabacionEn", ahora);
      }
      if (tocaAvisoBorrado(t, t.funcion, ahora)) await avisar(t, "por_borrar", enLinea, "avisoBorradoEn", ahora);
      if (tocaAvisoDescarga(t, t.funcion, ahora)) await avisar(t, "descarga_por_borrar", descarga, "avisoDescargaEn", ahora);

      if (t.guardarAnio) {
        const porCopiar = vivas.find(g => g.estado === "lista" && g.mp4Estado === "lista" && !g.r2Key);
        if (porCopiar) copiarEnSegundoPlano(porCopiar, t);
      }

      // Vence el plazo en línea: se borra en Cloudflare. Con "Guardar 1 año", solo lo ya copiado a R2.
      if (ahora >= enLinea) {
        for (const g of vivas) {
          if (!t.guardarAnio || g.r2Key || g.estado !== "lista") await borrarParteEnProveedor(g, ahora);
        }
        if (!t.guardarAnio) await prisma.evento_transmisiones.update({ where: { id: t.id }, data: { grabacionBorradaEn: ahora } });
      }
      // Vence la descarga de 1 año: se borra de R2.
      if (t.guardarAnio && ahora >= descarga) await borrarGrabacion(t, ahora);
    } catch (e) {
      logger.error(`Grabación de la transmisión ${t.id}: ${e.message}`);
    }
  }
}

/**
 * Partes con su URL de ver (si sigue en línea) y de descargar: MP4 firmado de
 * Cloudflare mientras está en línea, o de R2 con "Guardar 1 año".
 */
export async function partesConEnlaces(t, ahora = new Date()) {
  const vivas = (t.grabaciones ?? []).filter(g => g.estado === "lista" || (g.estado === "borrada" && g.r2Key));
  const enLinea = ahora < grabacionHasta(t, t.funcion);
  const total = vivas.length;
  const evento = t.funcion.evento.producto.nombre;
  return Promise.all(vivas.map(async (g) => {
    const nombre = nombreArchivo(evento, g.orden, total);
    const verUrl = enLinea && g.estado === "lista"
      ? (await provider().urlReproduccion(g.videoId, { expiraEn: new Date(ahora.getTime() + 4 * 60 * MS_MIN) })).iframeUrl
      : null;
    let descargaUrl = null;
    if (g.r2Key) descargaUrl = await urlPrivada(g.r2Key, { segundos: 3600, nombreArchivo: nombre });
    else if (enLinea && g.mp4Estado === "lista") descargaUrl = await provider().urlDescarga(g.videoId, { expiraEn: new Date(ahora.getTime() + 60 * MS_MIN), nombreArchivo: nombre });
    return { orden: g.orden, duracionSeg: g.duracionSeg, verUrl, descargaUrl, preparandoDescarga: !descargaUrl && enLinea && g.mp4Estado !== "error" };
  }));
}

export { conGrabacion };
