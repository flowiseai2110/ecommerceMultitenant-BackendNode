import { prisma, Prisma } from "../../config/prisma.js";
import config from "../../config/index.js";
import { logger } from "../../config/logger.js";
import { getStreamingProvider } from "../../services/streaming/index.js";
import { sendTransmisionAvisoFinEmail } from "../../services/email.service.js";
import { UnprocessableError } from "../../utils/errors.js";
import { registrarConsumo, saldoHoras, textoMinutos } from "./transmisiones.horas.js";
import { firmarTokenAccion } from "./transmisiones.token.js";
import { conGrabacion, registrarGrabaciones } from "./transmisiones.grabaciones.js";
import {
  EXTENSIONES_MIN, EXTENSION_MAX_MIN, corteEn, debeEstarHabilitada, debeRetransmitir, esVideoPropio, finTransmision, minutosADescontar,
  minutosConsumidos, montoExcedente, periodoTransmision, salaAbreEn, tocaAvisoFin, tocaExtensionAuto
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
const noProcesable = (message, motivo, extra = {}) => new UnprocessableError(message, { message, motivo, ...extra });

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

/**
 * Retransmisión a Facebook/YouTube (Premium, R8.2): cada salida emite solo
 * desde que abre la sala hasta el corte; nunca en la prueba previa.
 */
export async function sincronizarRetransmision(t, ahora = new Date()) {
  if (t.plan !== "premium" || !t.entradaId) return;
  const debe = debeRetransmitir(t, t.funcion, ahora);
  const destinos = await prisma.transmision_destinos.findMany({ where: { transmisionId: t.id, salidaId: { not: null }, habilitada: !debe } });
  for (const d of destinos) {
    await provider().habilitarSalida(t.entradaId, d.salidaId, debe);
    await prisma.transmision_destinos.update({ where: { id: d.id }, data: { habilitada: debe, fechaActualizacion: ahora } });
  }
}

/**
 * Borra la entrada en el proveedor. Con grabación (Fase 4), antes registra las
 * partes grabadas y borra SOLO la entrada: los videos se conservan hasta que
 * vence su plazo. "Solo en vivo" o cancelada: borra videos y entrada. Se
 * reintenta en cada ciclo si falla.
 */
export async function limpiarEntrada(t, ahora = new Date()) {
  if (!t.entradaId || t.limpiadaEn) return;
  if (t.terminadaEn && t.estado !== "cancelada" && conGrabacion(t)) {
    await registrarGrabaciones(t, ahora);
    await provider().borrarSoloEntrada(t.entradaId);
  } else {
    await provider().borrarEntrada(t.entradaId);
  }
  await prisma.evento_transmisiones.update({ where: { id: t.id }, data: { limpiadaEn: ahora, habilitada: false } });
  // Sin entrada, sus salidas de retransmisión ya no existen en el proveedor.
  if (t.plan === "premium") {
    await prisma.transmision_destinos.updateMany({ where: { transmisionId: t.id }, data: { salidaId: null, habilitada: false, fechaActualizacion: ahora } });
  }
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
    // Siempre: aunque no haya consumo, cierra (anula) un excedente que no se usó.
    await registrarConsumo(tx, t, descontados, ahora);
    return true;
  });
  if (terminada) {
    logger.info(`Transmisión ${t.id} terminada (${motivo}): ${minutos} min, descuenta ${descontados}`);
    // Ya terminada: con grabación conserva los videos y borra solo la entrada.
    await limpiarEntrada({ ...t, limpiadaEn: null, terminadaEn: ahora }, ahora).catch(e => logger.warn(`Limpieza pendiente de ${t.id}: ${e.message}`));
  }
  return terminada;
}

/**
 * Opciones de extensión para mostrar con su precio (R7.5): cuánto de paquete
 * usa, cuánto saldría como excedente y si se puede.
 */
export async function opcionesExtension(t, ahora = new Date()) {
  const saldo = await saldoHoras(t.tiendaId, periodoTransmision(t.funcion), { ahora });
  return EXTENSIONES_MIN.map(minutos => {
    const necesarios = minutosADescontar(minutos, t.factor ?? 1);
    const deHoras = Math.min(necesarios, saldo.disponiblesMin);
    const excedente = necesarios - deHoras;
    let motivo = null;
    if ((t.extensionMin ?? 0) + minutos > EXTENSION_MAX_MIN) motivo = "Llegaste al máximo de 3 h de extensión";
    else if (excedente > saldo.excedente.disponibleMin) motivo = "No quedan horas y llegaste al tope de excedente del mes";
    return { minutos, minutosPaquete: necesarios, deHorasMin: deHoras, excedenteMin: excedente, monto: montoExcedente(excedente), permitido: !motivo, motivo };
  });
}

/**
 * Extiende la transmisión (R7.5-R7.7). Si quedan horas (plan o paquete) se
 * usan sin cobro; si no, lo que falte se autoriza como excedente, con su tope
 * del mes. Quien confirma queda registrado: nunca se cobra sin confirmación.
 * @param {{ quien: string, ahora?: Date }} opts
 */
export async function extenderTransmision(t, minutos, { quien, ahora = new Date() }) {
  if (!esVideoPropio(t)) throw noProcesable("Solo el plan Privado se puede extender", "SOLO_PRIVADO");
  if (t.estado === "cancelada" || t.terminadaEn) throw noProcesable("La transmisión ya terminó", "TERMINADA");
  if (ahora >= corteEn(t, t.funcion)) throw noProcesable("La transmisión ya se cortó", "CORTADA");
  if (!EXTENSIONES_MIN.includes(minutos)) throw noProcesable("Puedes extender 30 minutos o 1 hora", "EXTENSION_INVALIDA");

  const opcion = (await opcionesExtension(t, ahora)).find(o => o.minutos === minutos);
  if (!opcion.permitido) throw noProcesable(opcion.motivo, "EXTENSION_NO_PERMITIDA");

  await prisma.$transaction(async (tx) => {
    if (opcion.excedenteMin > 0) {
      await tx.transmision_excedentes.upsert({
        where: { transmisionId: t.id },
        create: {
          tiendaId: t.tiendaId, transmisionId: t.id, periodo: periodoTransmision(t.funcion),
          minutosAutorizados: opcion.excedenteMin, autorizadoPor: quien, autorizadoEn: ahora
        },
        update: { minutosAutorizados: { increment: opcion.excedenteMin }, autorizadoPor: quien, autorizadoEn: ahora, fechaActualizacion: ahora }
      });
    }
    await tx.evento_transmisiones.update({
      where: { id: t.id },
      // Nuevo fin: el aviso de los 15 min vuelve a enviarse antes del nuevo corte.
      data: { extensionMin: { increment: minutos }, avisoFinEn: null, noExtender: false, fechaActualizacion: ahora, usuarioActualizacion: quien }
    });
  });
  logger.info(`Transmisión ${t.id} extendida ${minutos} min por ${quien} (excedente ${opcion.excedenteMin} min)`);
  return opcion;
}

/** "Terminar a la hora": no se aplica la extensión automática. */
export async function noExtender(t, quien, ahora = new Date()) {
  await prisma.evento_transmisiones.update({
    where: { id: t.id },
    data: { noExtender: true, fechaActualizacion: ahora, usuarioActualizacion: quien }
  });
}

/**
 * Aviso de los 15 minutos (R7.5): correo al negocio y al contacto de la
 * transmisión, con un enlace firmado para extender sin iniciar sesión.
 */
async function enviarAvisoFin(t, ahora) {
  const marcado = await prisma.evento_transmisiones.updateMany({ where: { id: t.id, avisoFinEn: null }, data: { avisoFinEn: ahora } });
  if (marcado.count !== 1) return; // otra réplica ya lo envió
  const tienda = await prisma.tiendas.findUnique({ where: { id: t.tiendaId }, select: { nombre: true, email: true } });
  const destinos = [...new Set([tienda?.email, t.contactoEmail].filter(Boolean))];
  if (!destinos.length) return;
  const corte = corteEn(t, t.funcion);
  const token = await firmarTokenAccion({ transmisionId: t.id, tiendaId: t.tiendaId, expiraEn: new Date(corte.getTime() + 30 * MS_MIN) });
  const opciones = await opcionesExtension(t, ahora);
  await sendTransmisionAvisoFinEmail({
    to: destinos,
    tiendaNombre: tienda.nombre,
    evento: t.funcion.evento?.producto?.nombre ?? "tu evento",
    minutosRestantes: Math.max(0, Math.round((finTransmision(t, t.funcion) - ahora) / MS_MIN)),
    corte,
    accionUrl: `${config.frontendUrl.replace(/\/+$/, "")}/transmision/accion/${token}`,
    opciones: opciones.map(o => ({ ...o, texto: o.excedenteMin ? `S/ ${o.monto}` : `usa ${textoMinutos(o.minutosPaquete)} de tu paquete` }))
  }).catch(e => logger.error(`No se envió el aviso de fin de ${t.id}: ${e.message}`));
}

/**
 * Un ciclo del job (cada minuto):
 *  1. Transmisiones con video propio en curso o por empezar (o en prueba):
 *     corte a los 5 min del fin, habilitación de la entrada y señal real.
 *  2. Canceladas o terminadas cuya limpieza quedó pendiente.
 */
export async function cicloTransmisiones(ahora = new Date()) {
  const proxima = new Date(ahora.getTime() + 61 * MS_MIN);
  const INCLUDE_CICLO = {
    funcion: { select: { inicio: true, fin: true, evento: { select: { producto: { select: { nombre: true } } } } } },
    excedente: true
  };
  const activas = await prisma.evento_transmisiones.findMany({
    where: {
      plan: { not: "basico" },
      estado: "programada",
      terminadaEn: null,
      entradaId: { not: null },
      OR: [{ habilitada: true }, { pruebaHasta: { gt: new Date(ahora.getTime() - 15 * MS_MIN) } }, { funcion: { inicio: { lte: proxima } } }]
    },
    include: INCLUDE_CICLO
  });

  for (let t of activas) {
    try {
      // Extensión automática autorizada al activar (R7.6): al llegar al fin, con señal.
      if (tocaExtensionAuto(t, t.funcion, ahora)) {
        try {
          await extenderTransmision(t, 30, { quien: "extensión automática", ahora });
          t = await prisma.evento_transmisiones.findUnique({ where: { id: t.id }, include: INCLUDE_CICLO });
        } catch (e) {
          logger.warn(`Extensión automática de ${t.id} no aplicada: ${e.message}`);
        }
      }
      if (ahora >= corteEn(t, t.funcion)) {
        await terminarTransmision(t, { motivo: "corte", ahora });
        continue;
      }
      if (tocaAvisoFin(t, t.funcion, ahora)) await enviarAvisoFin(t, ahora);
      t = await sincronizarHabilitacion(t, ahora);
      await sincronizarRetransmision(t, ahora);
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
    include: INCLUDE,
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
