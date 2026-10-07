import { prisma, Prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { getStreamingProvider } from "../../services/streaming/index.js";
import { registrarConsumo } from "./transmisiones.horas.js";
import {
  corteEn, debeEstarHabilitada, esVideoPropio, minutosADescontar, minutosConsumidos, periodoTransmision, salaAbreEn
} from "./transmisiones.reglas.js";

/**
 * Transmisión en vivo con video propio (plan Privado, Fase 2): todo lo que
 * habla con el proveedor de video y lo que hace el job cada minuto.
 *
 * Cloudflare no corta solo por duración: el corte (R7.8) lo hace el backend
 * deshabilitando la entrada. Como respaldo de los webhooks, el job consulta la
 * señal de las transmisiones en su ventana (reconciliación).
 */

const MS_MIN = 60 * 1000;
const provider = () => getStreamingProvider();
const INCLUDE = { funcion: { select: { inicio: true, fin: true } } };

/** Cambia la señal. La primera señal dentro de la ventana del evento marca el inicio real (R7.1). */
export async function aplicarSenal(t, senal, ahora = new Date()) {
  if (!senal || (t.senal === senal && t.senalEn)) return t;
  const enVentana = ahora >= salaAbreEn(t.funcion);
  return prisma.evento_transmisiones.update({
    where: { id: t.id },
    data: {
      senal,
      senalEn: ahora,
      ...(senal === "conectada" && enVentana && !t.inicioRealEn ? { inicioRealEn: ahora } : {})
    },
    include: INCLUDE
  });
}

/** Deja la entrada habilitada solo en la prueba o en la ventana del evento. */
export async function sincronizarHabilitacion(t, ahora = new Date()) {
  const debe = debeEstarHabilitada(t, t.funcion, ahora);
  if (debe === t.habilitada || !t.entradaId) return t;
  await provider().habilitarEntrada(t.entradaId, debe);
  // Terminó una prueba antes de la sala: sus videos no sirven y ocupan almacenamiento.
  if (!debe && ahora < salaAbreEn(t.funcion)) {
    await provider().borrarVideos(t.entradaId).catch(e => logger.warn(`No se borraron los videos de prueba ${t.id}: ${e.message}`));
  }
  return prisma.evento_transmisiones.update({
    where: { id: t.id },
    data: { habilitada: debe, ...(debe ? {} : { senal: "sin_senal", senalEn: ahora }) },
    include: INCLUDE
  });
}

/** Borra en el proveedor los videos y la entrada ("Solo en vivo"). Se reintenta en cada ciclo si falla. */
export async function limpiarEntrada(t, ahora = new Date()) {
  if (!t.entradaId || t.limpiadaEn) return;
  await provider().borrarEntrada(t.entradaId);
  await prisma.evento_transmisiones.update({ where: { id: t.id }, data: { limpiadaEn: ahora, habilitada: false } });
}

/**
 * Termina la transmisión: corte del job (R7.8) o "Terminar" del admin o de la
 * app (R6.3). Corta la señal, mide lo transmitido y lo descuenta del mes una
 * sola vez (el updateMany con terminadaEn: null lo hace idempotente).
 * @returns {Promise<boolean>} true si esta llamada la terminó.
 */
export async function terminarTransmision(t, { motivo, ahora = new Date() }) {
  if (!esVideoPropio(t) || t.terminadaEn) return false;
  if (t.entradaId) {
    await provider().habilitarEntrada(t.entradaId, false)
      .catch(e => logger.error(`No se pudo cortar la señal de la transmisión ${t.id}: ${e.message}`));
  }
  // Si la señal ya se había caído, lo transmitido llega hasta esa caída.
  const finReal = t.senal === "desconectada" && t.senalEn && t.inicioRealEn && t.senalEn > t.inicioRealEn ? t.senalEn : ahora;
  const minutos = minutosConsumidos(t, t.funcion, finReal);
  const descontados = minutosADescontar(minutos, t.factor ?? 1);

  const terminada = await prisma.$transaction(async (tx) => {
    const r = await tx.evento_transmisiones.updateMany({
      where: { id: t.id, terminadaEn: null },
      data: { terminadaEn: ahora, habilitada: false, minutosUsados: minutos, minutosDescontados: descontados, fechaActualizacion: ahora, usuarioActualizacion: motivo }
    });
    if (r.count !== 1) return false;
    if (descontados > 0) await registrarConsumo(tx, t.tiendaId, periodoTransmision(t.funcion), descontados);
    return true;
  });
  if (terminada) {
    logger.info(`Transmisión ${t.id} terminada (${motivo}): ${minutos} min, descuenta ${descontados}`);
    await limpiarEntrada({ ...t, limpiadaEn: null }, ahora).catch(e => logger.warn(`Limpieza pendiente de ${t.id}: ${e.message}`));
  }
  return terminada;
}

/**
 * Un ciclo del job (cada minuto):
 *  1. Transmisiones con video propio en curso o por empezar (o en prueba):
 *     corte a los 5 min del fin, habilitación de la entrada y señal real.
 *  2. Canceladas o terminadas cuya limpieza quedó pendiente.
 */
export async function cicloTransmisiones(ahora = new Date()) {
  const proxima = new Date(ahora.getTime() + 61 * MS_MIN);
  const activas = await prisma.evento_transmisiones.findMany({
    where: {
      plan: { not: "basico" },
      estado: "programada",
      terminadaEn: null,
      entradaId: { not: null },
      OR: [{ habilitada: true }, { pruebaHasta: { gt: new Date(ahora.getTime() - 15 * MS_MIN) } }, { funcion: { inicio: { lte: proxima } } }]
    },
    include: INCLUDE
  });

  for (let t of activas) {
    try {
      if (ahora >= corteEn(t, t.funcion)) {
        await terminarTransmision(t, { motivo: "corte", ahora });
        continue;
      }
      t = await sincronizarHabilitacion(t, ahora);
      if (t.habilitada) {
        const { senal } = await provider().estadoEntrada(t.entradaId);
        if (senal !== t.senal) await aplicarSenal(t, senal, ahora);
      }
    } catch (e) {
      logger.error(`Job de transmisiones (${t.id}): ${e.message}`);
    }
  }

  const porLimpiar = await prisma.evento_transmisiones.findMany({
    where: { entradaId: { not: null }, limpiadaEn: null, OR: [{ estado: "cancelada" }, { terminadaEn: { not: null } }] },
    take: 20
  });
  for (const t of porLimpiar) {
    await limpiarEntrada(t, ahora).catch(e => logger.warn(`Limpieza pendiente de ${t.id}: ${e.message}`));
  }
  return { activas: activas.length, limpiadas: porLimpiar.length };
}

/**
 * Webhook del proveedor (R6.2, R10.2): verifica la firma, lo registra una sola
 * vez y aplica la señal. Devuelve { valido, duplicado } sin lanzar: al
 * proveedor siempre se le responde rápido.
 */
export async function procesarWebhook({ tipo, headers, rawBody }, ahora = new Date()) {
  const p = provider();
  const evento = p.verificarWebhook({ tipo, headers, rawBody });
  if (!evento) return { valido: false };
  try {
    await prisma.transmision_eventos_proveedor.create({
      data: { proveedor: p.nombre, eventoId: evento.eventoId, tipo: evento.tipo, entradaId: evento.entradaId, payload: evento.payload }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { valido: true, duplicado: true };
    throw error;
  }
  if (evento.senal && evento.entradaId) {
    const t = await prisma.evento_transmisiones.findFirst({
      where: { proveedor: p.nombre, entradaId: evento.entradaId, terminadaEn: null, estado: "programada" },
      include: INCLUDE
    });
    if (t) await aplicarSenal(t, evento.senal, ahora);
  }
  return { valido: true, duplicado: false };
}
