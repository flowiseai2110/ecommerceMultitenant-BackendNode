import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, NotFoundError, UnauthorizedError, UnprocessableError } from "../../utils/errors.js";
import { decryptSecret, encryptSecret } from "../../utils/crypto.js";
import { getStreamingProvider } from "../../services/streaming/index.js";
import { urlTienda } from "../resenas/resenas.service.js";
import {
  firmarTokenApp, firmarTokenInvitacion, verificarTokenAccion, verificarTokenAnfitrion, verificarTokenApp, verificarTokenInvitacion
} from "./transmisiones.token.js";
import { urlVideoYoutube, youtubeVideoId } from "./transmisiones.youtube.js";
import { saldoHoras, textoMinutos } from "./transmisiones.horas.js";
import { borrarGrabacion, enlaceAnfitrion, partesConEnlaces } from "./transmisiones.grabaciones.js";
import {
  extenderTransmision, limpiarEntrada, noExtender, opcionesExtension, sincronizarHabilitacion, terminarTransmision
} from "./transmisiones.envivo.js";
import {
  DIAS_GUARDAR_ANIO, FACTORES, PRECIO_GUARDAR_ANIO, PRUEBA_MIN, TOPES_PRIVADO, conGrabacion, corteEn, descargaHasta,
  duracionEfectiva, enlaceWhatsapp, esVideoPropio, etapaTransmision, finEnVivo, finTransmision, grabacionHasta, hayVideo,
  minutosADescontar, periodoTransmision, salaAbreEn, sesionViva, topeInvitaciones
} from "./transmisiones.reglas.js";

/**
 * Transmisión de eventos (docs/specs/transmision-eventos/plan.md):
 * - Fase 1: plan Básico (YouTube incrustado), consentimiento del anfitrión e
 *   invitaciones nominativas con un enlace firmado por invitado.
 * - Fase 2: plan Privado con video propio (Cloudflare Stream), tope de
 *   invitados con su factor, horas del plan mensual, datos de conexión
 *   cifrados, prueba de señal, "Terminar", sesión única por enlace y
 *   vinculación de la App Transmitir.
 * Todo filtra por tiendaId.
 */

const MS_MIN = 60 * 1000;
const VINCULACION_MIN = 10;
const usuarioDe = (user) => user?.email ?? user?.id ?? "system";
const noProcesable = (message, motivo, extra = {}) => new UnprocessableError(message, { message, motivo, ...extra });
const provider = () => getStreamingProvider();

const INCLUDE_FUNCION = {
  evento: {
    select: {
      privado: true,
      lugar: true,
      producto: {
        select: {
          nombre: true,
          imagenes: { where: { esPrincipal: true }, take: 1, select: { url: true } }
        }
      }
    }
  }
};

/** R1.1: solo los negocios de eventos transmiten. */
async function tiendaDeEventos(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({
    where: { id: tiendaId },
    select: { id: true, slug: true, nombre: true, logoUrl: true, tipoNegocio: true }
  });
  if (!tienda) throw new NotFoundError("Tienda");
  if (tienda.tipoNegocio !== "eventos") {
    throw noProcesable("La transmisión en vivo es solo para negocios de eventos", "TIPO_NEGOCIO");
  }
  return tienda;
}

async function funcionDeTienda(tiendaId, funcionId) {
  const funcion = await prisma.evento_funciones.findFirst({
    where: { id: funcionId, tiendaId },
    include: { ...INCLUDE_FUNCION, transmision: { include: { invitaciones: { orderBy: { fechaRegistro: "asc" } }, excedente: true, grabaciones: { orderBy: { orden: "asc" } }, cargos: true } } }
  });
  if (!funcion) throw new NotFoundError("Función", "Esa función del evento no existe");
  return funcion;
}

async function transmisionDeTienda(tiendaId, id) {
  const transmision = await prisma.evento_transmisiones.findFirst({
    where: { id, tiendaId },
    include: { funcion: { include: INCLUDE_FUNCION }, invitaciones: { orderBy: { fechaRegistro: "asc" } }, excedente: true, grabaciones: { orderBy: { orden: "asc" } }, cargos: true }
  });
  if (!transmision) throw new NotFoundError("Transmisión", "Esa transmisión no existe");
  return transmision;
}

const enCurso = (t) => t.estado !== "cancelada" && !t.terminadaEn;

function exigirEnCurso(t) {
  if (t.estado === "cancelada") throw noProcesable("La transmisión está cancelada", "CANCELADA");
  if (t.terminadaEn) throw noProcesable("La transmisión ya terminó", "TERMINADA");
}

function exigirVideoPropio(t) {
  if (!esVideoPropio(t)) throw noProcesable("Esta opción es del plan Privado", "SOLO_PRIVADO");
}

/** Datos de conexión descifrados (R5.1). Solo para editor+ y la App Transmitir. */
function conexionDe(t) {
  const c = JSON.parse(decryptSecret(t.claveCifrada) ?? "{}");
  return {
    rtmpsUrl: c.rtmpsUrl,
    streamKey: c.streamKey,
    // Larix y casi todas las apps piden la URL con la clave al final.
    urlCompleta: c.rtmpsUrl && c.streamKey ? `${c.rtmpsUrl}${c.streamKey}` : null,
    srtUrl: c.srtUrl && c.srtStreamId ? `${c.srtUrl}?streamid=${c.srtStreamId}&passphrase=${c.srtPassphrase}` : null
  };
}

// ============================================
// Serialización (admin)
// ============================================

async function serializarInvitacion(inv, { tienda, evento, funcion, ahora }) {
  const activa = inv.estado === "activa";
  const enlace = activa
    ? urlTienda(tienda.slug, `t/${await firmarTokenInvitacion({ invitacionId: inv.id, tiendaId: inv.tiendaId, version: inv.version })}`)
    : null;
  return {
    id: inv.id,
    nombre: inv.nombre,
    telefono: inv.telefono,
    estado: inv.estado,
    primeraConexionEn: inv.primeraConexionEn,
    ultimaConexionEn: inv.ultimaConexionEn,
    viendoAhora: sesionViva(inv, ahora),
    enlace,
    whatsappUrl: enlace ? enlaceWhatsapp({ telefono: inv.telefono, nombre: inv.nombre, evento, inicio: funcion.inicio, enlace }) : null
  };
}

/** Estado de la grabación para el admin (Fase 4, R8.1). */
async function serializarGrabacion(t, funcion, ahora) {
  const partes = (t.grabaciones ?? []).filter(g => g.estado !== "borrada" || g.r2Key);
  const cargo = (t.cargos ?? []).find(c => c.tipo === "guardar_anio" && c.estado !== "anulado");
  const terminada = !!t.terminadaEn;
  return {
    grabar: t.grabar,
    guardarAnio: t.guardarAnio,
    // Mientras está en línea se ve y se descarga; con "Guardar 1 año", la descarga sigue en R2.
    enLineaHasta: grabacionHasta(t, funcion),
    descargaHasta: descargaHasta(t, funcion),
    borradaEn: t.grabacionBorradaEn,
    partes: partes.map(g => ({
      orden: g.orden, estado: g.estado, duracionSeg: g.duracionSeg, mp4Estado: g.mp4Estado, copiadaR2: !!g.r2CopiadaEn
    })),
    avisoListaEn: t.avisoGrabacionEn,
    enlaceAnfitrion: terminada && t.grabar && !t.grabacionBorradaEn && partes.length ? await enlaceAnfitrion(t) : null,
    cargoGuardarAnio: cargo ? { monto: Number(cargo.monto), estado: cargo.estado } : null,
    puedeGuardarAnio: terminada && t.grabar && !t.guardarAnio && !t.grabacionBorradaEn && partes.some(g => g.estado === "lista") && ahora < grabacionHasta(t, funcion),
    precioGuardarAnio: PRECIO_GUARDAR_ANIO
  };
}

async function serializarTransmision(t, funcion, tienda, ahora) {
  const evento = funcion.evento.producto.nombre;
  const invitaciones = await Promise.all(t.invitaciones.map(inv => serializarInvitacion(inv, { tienda, evento, funcion, ahora })));
  const etapa = etapaTransmision(t, funcion, ahora);
  const propio = esVideoPropio(t);
  const contratados = duracionEfectiva(t, funcion);
  return {
    id: t.id,
    funcionId: t.funcionId,
    plan: t.plan,
    estado: t.estado,
    etapa,
    inicio: funcion.inicio,
    fin: finTransmision(t, funcion),
    salaAbreEn: salaAbreEn(funcion),
    grabacionHasta: grabacionHasta(t, funcion),
    // Editable solo si la función no tiene hora de fin (R1.2).
    duracionMin: t.duracionMin,
    duracionEditable: !funcion.fin && !propio,
    youtubeUrl: urlVideoYoutube(t.youtubeVideoId),
    anfitrionNombre: t.anfitrionNombre,
    anfitrionEmail: t.anfitrionEmail,
    consentimientoEn: t.consentimientoEn,
    consentimientoPor: t.consentimientoPor,
    tope: topeInvitaciones(t),
    activas: t.invitaciones.filter(i => i.estado === "activa").length,
    entraron: t.invitaciones.filter(i => i.primeraConexionEn).length,
    viendoAhora: invitaciones.filter(i => i.viendoAhora).length,
    invitaciones,
    // Plan Privado (R6.1, R7.2)
    envivo: propio ? {
      senal: t.senal,
      senalEn: t.senalEn,
      habilitada: t.habilitada,
      pruebaHasta: t.pruebaHasta && t.pruebaHasta > ahora ? t.pruebaHasta : null,
      corteEn: corteEn(t, funcion),
      inicioRealEn: t.inicioRealEn,
      terminadaEn: t.terminadaEn,
      maxInvitados: t.maxInvitados,
      factor: Number(t.factor),
      minutosContratados: contratados,
      minutosADescontar: minutosADescontar(contratados, t.factor),
      minutosUsados: t.minutosUsados,
      minutosDescontados: t.minutosDescontados,
      // Fase 3: extensión, aviso de 15 min, contacto y excedente (R7.5-R7.7).
      extensionMin: t.extensionMin,
      extensionAutoMaxMin: t.extensionAutoMaxMin,
      noExtender: t.noExtender,
      avisoFinEn: t.avisoFinEn,
      contacto: { nombre: t.contactoNombre, email: t.contactoEmail, telefono: t.contactoTelefono },
      excedente: t.excedente
        ? { estado: t.excedente.estado, minutosAutorizados: t.excedente.minutosAutorizados, minutos: t.excedente.minutos, monto: Number(t.excedente.monto) }
        : null,
      opcionesExtension: enCurso(t) && ["espera", "en_vivo"].includes(etapa) ? await opcionesExtension(t, ahora) : [],
      // Fase 4: grabación (R8.1)
      grabacion: await serializarGrabacion(t, funcion, ahora),
      // Para que el negocio vea la señal (prueba o en vivo) sin ser invitado.
      vistaPreviaUrl: enCurso(t) && t.entradaId
        ? (await provider().urlReproduccion(t.entradaId, { expiraEn: new Date(ahora.getTime() + 3 * 60 * MS_MIN) })).iframeUrl
        : null
    } : null
  };
}

function resumenFuncion(funcion) {
  return {
    id: funcion.id,
    productoId: funcion.productoId,
    nombre: funcion.nombre,
    inicio: funcion.inicio,
    fin: funcion.fin,
    evento: { nombre: funcion.evento.producto.nombre, privado: funcion.evento.privado, lugar: funcion.evento.lugar }
  };
}

/** Saldo del mes de la función y lo que costaría cada tope (R7.2), para la pantalla de activar. */
async function horasParaFuncion(tiendaId, funcion, transmision) {
  const saldo = await saldoHoras(tiendaId, periodoTransmision(funcion), { excluirId: transmision?.id });
  const minutos = funcion.fin ? Math.round((funcion.fin - funcion.inicio) / MS_MIN) : null;
  return {
    ...saldo,
    opciones: TOPES_PRIVADO.map(tope => ({
      maxInvitados: tope,
      factor: FACTORES[tope],
      // Sin hora de fin, el frontend calcula con la duración que elija.
      minutosADescontar: minutos ? minutosADescontar(minutos, FACTORES[tope]) : null
    }))
  };
}

// ============================================
// Admin
// ============================================

/** La función con su transmisión (o null), invitaciones y horas del mes, para la pantalla "Transmitir". */
export async function obtenerPorFuncion(tiendaId, funcionId, ahora = new Date()) {
  const tienda = await tiendaDeEventos(tiendaId);
  const funcion = await funcionDeTienda(tiendaId, funcionId);
  return {
    funcion: resumenFuncion(funcion),
    transmision: funcion.transmision ? await serializarTransmision(funcion.transmision, funcion, tienda, ahora) : null,
    horas: await horasParaFuncion(tiendaId, funcion, funcion.transmision)
  };
}

/** Transmisiones de la tienda (próximas primero), para el listado del admin. */
export async function listarTransmisiones(tiendaId, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const filas = await prisma.evento_transmisiones.findMany({
    where: { tiendaId },
    include: {
      funcion: { include: INCLUDE_FUNCION },
      _count: { select: { invitaciones: { where: { estado: "activa" } } } }
    },
    orderBy: { funcion: { inicio: "desc" } }
  });
  return filas.map(t => ({
    id: t.id,
    plan: t.plan,
    etapa: etapaTransmision(t, t.funcion, ahora),
    invitados: t._count.invitaciones,
    funcion: resumenFuncion(t.funcion)
  }));
}

/** R1: activa la transmisión de una función con el plan Básico o Privado. */
export async function activar(tiendaId, funcionId, data, user, ahora = new Date()) {
  const tienda = await tiendaDeEventos(tiendaId);
  const funcion = await funcionDeTienda(tiendaId, funcionId);
  if (funcion.transmision) {
    throw new ConflictError("Esta función ya tiene una transmisión", { message: "Esta función ya tiene una transmisión", motivo: "YA_EXISTE" });
  }
  if (!funcion.activa) throw noProcesable("La función está desactivada. Actívala antes de transmitir", "FUNCION_INACTIVA");

  let duracionMin;
  if (funcion.fin) {
    duracionMin = Math.round((funcion.fin.getTime() - funcion.inicio.getTime()) / MS_MIN);
    if (duracionMin > 720) throw noProcesable("La función dura más de 12 horas. Ajusta su hora de fin", "DURACION");
  } else {
    if (!data.duracionMin) throw noProcesable("La función no tiene hora de fin: indica cuánto durará la transmisión", "DURACION_REQUERIDA");
    duracionMin = data.duracionMin;
  }
  const fin = funcion.fin ?? new Date(funcion.inicio.getTime() + duracionMin * MS_MIN);
  if (fin <= ahora) throw noProcesable("Esta función ya terminó", "FUNCION_PASADA");

  const usuario = usuarioDe(user);
  const base = {
    tiendaId,
    funcionId,
    plan: data.plan,
    duracionMin,
    anfitrionNombre: data.anfitrionNombre,
    anfitrionEmail: data.anfitrionEmail,
    consentimientoEn: ahora,
    consentimientoPor: usuario,
    usuarioRegistro: usuario,
    // Contacto de la transmisión: recibe el aviso de los 15 min (R7.5).
    contactoNombre: data.contactoNombre ?? null,
    contactoEmail: data.contactoEmail ?? null,
    contactoTelefono: data.contactoTelefono ?? null
  };

  if (data.plan === "basico") {
    await prisma.evento_transmisiones.create({ data: { ...base, youtubeVideoId: youtubeVideoId(data.youtubeUrl) } });
    return obtenerPorFuncion(tienda.id, funcionId, ahora);
  }

  // Privado: evento privado (R1.4) y horas suficientes en el mes (R1.3).
  if (!funcion.evento.privado) {
    throw noProcesable("El plan Privado es para eventos privados. Marca el evento como privado en sus funciones", "EVENTO_PUBLICO");
  }
  const factor = FACTORES[data.maxInvitados];
  const necesarios = minutosADescontar(duracionMin, factor);
  const saldo = await saldoHoras(tiendaId, periodoTransmision(funcion));
  if (necesarios > saldo.disponiblesMin) {
    const faltan = necesarios - saldo.disponiblesMin;
    throw noProcesable(
      `Esta transmisión usará ${textoMinutos(necesarios)} de tu paquete y te quedan ${textoMinutos(saldo.disponiblesMin)} este mes. ` +
      `Te faltan ${textoMinutos(faltan)}: escríbenos para comprar un paquete de horas o elige menos invitados.`,
      "HORAS_INSUFICIENTES",
      { necesariosMin: necesarios, disponiblesMin: saldo.disponiblesMin }
    );
  }

  const id = crypto.randomUUID();
  const borrador = { ...base, id, maxInvitados: data.maxInvitados, factor, pruebaHasta: null, terminadaEn: null, estado: "programada" };
  const habilitada = debeHabilitarAlCrear(borrador, funcion, ahora);
  const { entradaId, conexion } = await provider().crearEntrada({
    nombre: `${funcion.evento.producto.nombre} · ${tienda.slug}`,
    meta: { tiendaId, transmisionId: id, funcionId },
    habilitada
  });
  try {
    await prisma.evento_transmisiones.create({
      data: {
        ...base,
        id,
        proveedor: provider().nombre,
        entradaId,
        claveCifrada: encryptSecret(JSON.stringify(conexion)),
        maxInvitados: data.maxInvitados,
        factor,
        habilitada,
        // R7.6: autorización previa para extender sola hasta 30 min o 1 h.
        extensionAutoMaxMin: data.extensionAutoMaxMin ?? 0,
        // R8.1.3: grabación incluida y activada por defecto; false = "Solo en vivo".
        grabar: data.grabar ?? true
      }
    });
  } catch (error) {
    // Sin fila en la BD, la entrada del proveedor quedaría huérfana.
    await provider().borrarEntrada(entradaId).catch(e => logger.error(`Entrada huérfana ${entradaId}: ${e.message}`));
    throw error;
  }
  return obtenerPorFuncion(tienda.id, funcionId, ahora);
}

function debeHabilitarAlCrear(t, funcion, ahora) {
  return ahora >= salaAbreEn(funcion) && ahora < corteEn(t, funcion);
}

export async function editar(tiendaId, id, data, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirEnCurso(t);

  const cambios = {};
  if (data.youtubeUrl !== undefined) {
    if (esVideoPropio(t)) throw noProcesable("El plan Privado no usa YouTube", "SOLO_BASICO");
    cambios.youtubeVideoId = youtubeVideoId(data.youtubeUrl);
  }
  if (data.duracionMin !== undefined) {
    if (t.funcion.fin) throw noProcesable("La duración sale de la hora de fin de la función. Cámbiala en la función", "DURACION_DE_FUNCION");
    // En Privado la duración define las horas reservadas: se fija al activar.
    if (esVideoPropio(t)) throw noProcesable("En el plan Privado la duración se fija al activar", "DURACION_FIJA");
    cambios.duracionMin = data.duracionMin;
  }
  if (data.anfitrionNombre !== undefined) cambios.anfitrionNombre = data.anfitrionNombre;
  if (data.anfitrionEmail !== undefined) cambios.anfitrionEmail = data.anfitrionEmail;
  for (const campo of ["contactoNombre", "contactoEmail", "contactoTelefono"]) {
    if (data[campo] !== undefined) cambios[campo] = data[campo];
  }
  if (data.extensionAutoMaxMin !== undefined) {
    exigirVideoPropio(t);
    cambios.extensionAutoMaxMin = data.extensionAutoMaxMin;
  }
  // "Solo en vivo" o grabar: se elige hasta que termina (R8.1.3).
  if (data.grabar !== undefined) {
    exigirVideoPropio(t);
    cambios.grabar = data.grabar;
  }

  await prisma.evento_transmisiones.update({
    where: { id },
    data: { ...cambios, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
  });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** Los invitados ven "La transmisión fue cancelada". No se puede deshacer. En Privado libera las horas reservadas. */
export async function cancelar(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  if (t.terminadaEn) throw noProcesable("La transmisión ya terminó", "TERMINADA");
  if (t.estado !== "cancelada") {
    await prisma.evento_transmisiones.update({
      where: { id },
      data: { estado: "cancelada", habilitada: false, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
    });
    if (esVideoPropio(t)) {
      await limpiarEntrada(t, ahora).catch(e => logger.warn(`Limpieza pendiente de ${t.id} (la reintenta el job): ${e.message}`));
    }
  }
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R6.3: "Terminar" antes de tiempo. Lo no usado no se descuenta. */
export async function terminar(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  await terminarTransmision(t, { motivo: usuarioDe(user), ahora });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R7.5: extender 30 min o 1 h desde el admin. Usa horas o, si no quedan, autoriza excedente. */
export async function extender(tiendaId, id, minutos, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  await extenderTransmision(t, minutos, { quien: usuarioDe(user), ahora });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** "Terminar a la hora": no aplicar la extensión automática. */
export async function terminarALaHora(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  await noExtender(t, usuarioDe(user), ahora);
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** Horas de la tienda este mes (plan, paquetes y excedente), para la tarjeta "Tus horas". */
export async function horasTienda(tiendaId, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const periodo = periodoTransmision({ inicio: ahora });
  const [saldo, excedentes] = await Promise.all([
    saldoHoras(tiendaId, periodo, { ahora }),
    prisma.transmision_excedentes.findMany({
      where: { tiendaId, estado: { in: ["por_cobrar", "cobrado"] } },
      orderBy: { autorizadoEn: "desc" },
      take: 12,
      include: { transmision: { select: { funcion: { select: { inicio: true, evento: { select: { producto: { select: { nombre: true } } } } } } } } }
    })
  ]);
  return {
    ...saldo,
    excedentes: excedentes.map(e => ({
      id: e.id,
      evento: e.transmision.funcion.evento.producto.nombre,
      fecha: e.transmision.funcion.inicio,
      minutos: e.minutos,
      monto: Number(e.monto),
      estado: e.estado,
      cobradoEn: e.cobradoEn
    }))
  };
}

// ---------- Grabación (Fase 4) ----------

/**
 * "Guardar 1 año" (S/ 50, cargo manual): la descarga sigue 1 año en R2. Solo
 * mientras la grabación está en línea, para copiar el MP4 antes de borrarlo.
 */
export async function guardarAnio(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  if (!t.terminadaEn || !conGrabacion(t)) throw noProcesable("Esta transmisión no tiene una grabación para guardar", "SIN_GRABACION");
  if (t.guardarAnio) throw noProcesable("La grabación ya se guarda por 1 año", "YA_GUARDADA");
  if (ahora >= grabacionHasta(t, t.funcion)) throw noProcesable("La grabación ya venció: no se puede guardar", "VENCIDA");
  if (!t.grabaciones.some(g => g.estado === "lista")) throw noProcesable("La grabación todavía se está procesando. Intenta en unos minutos", "PROCESANDO");

  const usuario = usuarioDe(user);
  await prisma.$transaction(async (tx) => {
    await tx.transmision_cargos.upsert({
      where: { uq_transmision_cargo_tipo: { transmisionId: id, tipo: "guardar_anio" } },
      create: { tiendaId, transmisionId: id, tipo: "guardar_anio", monto: PRECIO_GUARDAR_ANIO, autorizadoPor: usuario, autorizadoEn: ahora },
      update: { estado: "por_cobrar", monto: PRECIO_GUARDAR_ANIO, autorizadoPor: usuario, autorizadoEn: ahora, fechaActualizacion: ahora }
    });
    // Nuevo plazo: el aviso de "la descarga vence" se calcula sobre el año.
    await tx.evento_transmisiones.update({
      where: { id },
      data: { guardarAnio: true, avisoDescargaEn: null, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
  });
  logger.info(`Transmisión ${id}: "Guardar ${DIAS_GUARDAR_ANIO} días" por ${usuario}`);
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R9.3: el anfitrión pidió borrar la grabación antes de su plazo. No se puede deshacer. */
export async function borrarGrabacionAhora(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  if (!t.terminadaEn || !t.limpiadaEn) throw noProcesable("La grabación se puede borrar cuando la transmisión termina", "EN_CURSO");
  if (t.grabacionBorradaEn) throw noProcesable("La grabación ya está borrada", "YA_BORRADA");
  await borrarGrabacion(t, ahora);
  // Un "Guardar 1 año" sin cobrar deja de tener sentido.
  await prisma.transmision_cargos.updateMany({
    where: { transmisionId: id, tipo: "guardar_anio", estado: "por_cobrar" },
    data: { estado: "anulado", fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
  });
  logger.info(`Grabación de la transmisión ${id} borrada a pedido por ${usuarioDe(user)}`);
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R5.1: datos para la app que transmite. Solo editor+ (lo exige la ruta). */
export async function datosConexion(tiendaId, id) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  return conexionDe(t);
}

/**
 * R5.5: clave nueva si se filtró. Cloudflare no rota la clave de una entrada:
 * se crea otra y se borra la anterior. No se permite con la señal llegando.
 */
export async function regenerarClave(tiendaId, id, user, ahora = new Date()) {
  const tienda = await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  if (t.senal === "conectada") throw noProcesable("Detén la transmisión en el celular antes de cambiar la clave", "SENAL_ACTIVA");

  const { entradaId, conexion } = await provider().crearEntrada({
    nombre: `${t.funcion.evento.producto.nombre} · ${tienda.slug}`,
    meta: { tiendaId, transmisionId: t.id, funcionId: t.funcionId },
    habilitada: t.habilitada
  });
  await prisma.evento_transmisiones.update({
    where: { id },
    data: {
      entradaId,
      claveCifrada: encryptSecret(JSON.stringify(conexion)),
      claveVersion: { increment: 1 },
      senal: "sin_senal",
      senalEn: ahora,
      fechaActualizacion: ahora,
      usuarioActualizacion: usuarioDe(user)
    }
  });
  await provider().borrarEntrada(t.entradaId).catch(e => logger.warn(`No se borró la entrada anterior ${t.entradaId}: ${e.message}`));
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R5.4: la entrada acepta señal 10 minutos, sin consumir horas ni mostrarse a los invitados antes de la sala. */
export async function iniciarPrueba(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  const actualizada = await prisma.evento_transmisiones.update({
    where: { id },
    data: { pruebaHasta: new Date(ahora.getTime() + PRUEBA_MIN * MS_MIN), fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) },
    include: { funcion: { select: { inicio: true, fin: true } } }
  });
  await sincronizarHabilitacion(actualizada, ahora);
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** R3.1 y R3.3: agrega invitados (uno o una lista) sin pasar el tope del plan. */
export async function agregarInvitados(tiendaId, id, invitados, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirEnCurso(t);

  const tope = topeInvitaciones(t);
  const activas = t.invitaciones.filter(i => i.estado === "activa").length;
  if (tope && activas + invitados.length > tope) {
    const quedan = Math.max(0, tope - activas);
    throw noProcesable(
      quedan ? `Esta transmisión permite ${tope} invitados. Puedes agregar ${quedan} más` : `Llegaste al tope de ${tope} invitados de esta transmisión`,
      "TOPE_INVITADOS"
    );
  }

  const usuario = usuarioDe(user);
  await prisma.evento_invitaciones.createMany({
    data: invitados.map(i => ({ tiendaId, transmisionId: id, nombre: i.nombre, telefono: i.telefono, usuarioRegistro: usuario }))
  });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

async function invitacionDeTienda(tiendaId, transmisionId, invitacionId) {
  const inv = await prisma.evento_invitaciones.findFirst({ where: { id: invitacionId, transmisionId, tiendaId } });
  if (!inv) throw new NotFoundError("Invitación", "Esa invitación no existe");
  return inv;
}

/** R3.4: el enlace deja de funcionar. */
export async function anularInvitacion(tiendaId, transmisionId, invitacionId, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, transmisionId);
  await invitacionDeTienda(tiendaId, transmisionId, invitacionId);
  await prisma.evento_invitaciones.update({
    where: { id: invitacionId },
    data: { estado: "anulada", sesionId: null, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
  });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

/** Enlace nuevo para el mismo invitado (si el anterior se reenvió a quien no debía). */
export async function regenerarInvitacion(tiendaId, transmisionId, invitacionId, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, transmisionId);
  const inv = await invitacionDeTienda(tiendaId, transmisionId, invitacionId);
  if (inv.estado !== "activa") throw noProcesable("La invitación está anulada", "ANULADA");
  await prisma.evento_invitaciones.update({
    where: { id: invitacionId },
    data: { version: { increment: 1 }, sesionId: null, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
  });
  return obtenerPorFuncion(tiendaId, t.funcionId, ahora);
}

// ============================================
// App Transmitir (R11, proyecto aparte)
// ============================================

const hash = (codigo) => crypto.createHash("sha256").update(codigo).digest("hex");

/** R11.1: código de un solo uso para el QR "Transmitir con este celular". Solo se guarda su hash. */
export async function crearVinculacion(tiendaId, id, user, ahora = new Date()) {
  await tiendaDeEventos(tiendaId);
  const t = await transmisionDeTienda(tiendaId, id);
  exigirVideoPropio(t);
  exigirEnCurso(t);
  const codigo = crypto.randomBytes(24).toString("base64url");
  const venceEn = new Date(ahora.getTime() + VINCULACION_MIN * MS_MIN);
  await prisma.transmision_vinculaciones.create({
    data: { tiendaId, transmisionId: id, codigoHash: hash(codigo), venceEn, usuarioRegistro: usuarioDe(user) }
  });
  return { codigo, qr: `ecompyme-transmitir://vincular?c=${codigo}`, venceEn };
}

async function datosParaApp(t, ahora) {
  const etapa = etapaTransmision(t, t.funcion, ahora);
  const limite = corteEn(t, t.funcion);
  return {
    transmision: {
      id: t.id,
      evento: t.funcion.evento.producto.nombre,
      inicio: t.funcion.inicio,
      fin: finTransmision(t, t.funcion),
      corteEn: limite
    },
    etapa,
    senal: t.senal,
    habilitada: t.habilitada,
    pruebaHasta: t.pruebaHasta && t.pruebaHasta > ahora ? t.pruebaHasta : null,
    segundosRestantes: Math.max(0, Math.floor((limite.getTime() - ahora.getTime()) / 1000)),
    viendoAhora: t.invitaciones.filter(i => i.estado === "activa" && sesionViva(i, ahora)).length
  };
}

/** R11.1: canjea el código del QR por los datos de conexión y un token de sesión de la app. */
export async function vincularApp(codigo, ahora = new Date()) {
  const noValido = new UnauthorizedError("El código no es válido o ya venció. Genera otro QR en el admin");
  const v = await prisma.transmision_vinculaciones.findUnique({ where: { codigoHash: hash(codigo) } });
  if (!v || v.usadoEn || v.venceEn <= ahora) throw noValido;
  const usado = await prisma.transmision_vinculaciones.updateMany({ where: { id: v.id, usadoEn: null }, data: { usadoEn: ahora } });
  if (usado.count !== 1) throw noValido;

  const t = await transmisionDeTienda(v.tiendaId, v.transmisionId);
  if (!enCurso(t) || !esVideoPropio(t)) throw noValido;
  const tienda = await prisma.tiendas.findUnique({ where: { id: t.tiendaId }, select: { nombre: true, logoUrl: true } });
  const token = await firmarTokenApp({
    transmisionId: t.id, tiendaId: t.tiendaId, claveVersion: t.claveVersion,
    expiraEn: new Date(corteEn(t, t.funcion).getTime() + 60 * MS_MIN)
  });
  return { token, tienda, conexion: conexionDe(t), ...(await datosParaApp(t, ahora)) };
}

/** La transmisión de un token de la app. Regenerar la clave (claveVersion) invalida la sesión (R11.9). */
async function transmisionDeApp(token) {
  const { transmisionId, tiendaId, claveVersion } = await verificarTokenApp(token);
  const t = await prisma.evento_transmisiones.findFirst({
    where: { id: transmisionId, tiendaId },
    include: { funcion: { include: INCLUDE_FUNCION }, invitaciones: true }
  });
  if (!t || t.claveVersion !== claveVersion || t.estado === "cancelada") {
    throw new UnauthorizedError("La sesión de la app ya no es válida. Vuelve a escanear el QR");
  }
  return t;
}

export async function estadoApp(token, ahora = new Date()) {
  return datosParaApp(await transmisionDeApp(token), ahora);
}

export async function terminarDesdeApp(token, ahora = new Date()) {
  const t = await transmisionDeApp(token);
  exigirEnCurso(t);
  await terminarTransmision(t, { motivo: "app", ahora });
  return datosParaApp(await transmisionDeApp(token), ahora);
}

export async function pruebaDesdeApp(token, ahora = new Date()) {
  const t = await transmisionDeApp(token);
  await iniciarPrueba(t.tiendaId, t.id, { id: "app" }, ahora);
  return datosParaApp(await transmisionDeApp(token), ahora);
}

// ============================================
// Store (página del invitado, R4)
// ============================================

/** Invitación activa del token. Cualquier problema responde 404, para no revelar si el enlace existió. */
async function invitacionDeToken(token, tiendaIdResuelta) {
  const { invitacionId, tiendaId, version } = await verificarTokenInvitacion(token);
  const noValido = new NotFoundError("Invitación", "Este enlace no es válido");
  if (tiendaIdResuelta && tiendaIdResuelta !== tiendaId) throw noValido;
  const inv = await prisma.evento_invitaciones.findFirst({
    where: { id: invitacionId, tiendaId },
    include: { transmision: { include: { funcion: { include: INCLUDE_FUNCION }, grabaciones: { where: { estado: "lista" }, orderBy: { orden: "asc" } } } } }
  });
  if (!inv || inv.version !== version || inv.estado !== "activa") throw noValido;
  return inv;
}

/** Lo que ve un invitado con su enlace. */
export async function paginaInvitado(token, tiendaIdResuelta, ahora = new Date()) {
  const inv = await invitacionDeToken(token, tiendaIdResuelta);
  const tienda = await prisma.tiendas.findUnique({ where: { id: inv.tiendaId }, select: { nombre: true, logoUrl: true } });
  if (!tienda) throw new NotFoundError("Invitación", "Este enlace no es válido");

  const t = inv.transmision;
  const funcion = t.funcion;
  const etapa = etapaTransmision(t, funcion, ahora);

  // Quién se conectó (R3, decisión "solo nominativas"): al abrir la página.
  await prisma.evento_invitaciones.update({
    where: { id: inv.id },
    data: { ultimaConexionEn: ahora, ...(inv.primeraConexionEn ? {} : { primeraConexionEn: ahora }) }
  });

  // Grabación del Privado (Fase 4): partes listas, mientras siga en línea.
  const conPartes = conGrabacion(t) && t.grabaciones.length > 0 && ahora < grabacionHasta(t, funcion);

  let video = null;
  if (hayVideo(t, etapa, { hayGrabacion: conPartes })) {
    if (!esVideoPropio(t) && t.youtubeVideoId) {
      video = { proveedor: "youtube", id: t.youtubeVideoId };
    } else if (etapa === "terminada") {
      // Los invitados ven la grabación; descargarla es del anfitrión (R8.1.1).
      const expiraEn = new Date(ahora.getTime() + 4 * 60 * MS_MIN);
      const partes = await Promise.all(t.grabaciones.map(async g => (await provider().urlReproduccion(g.videoId, { expiraEn })).iframeUrl));
      video = { proveedor: provider().nombre, iframeUrl: partes[0], partes };
    } else if (esVideoPropio(t) && t.entradaId) {
      // Token de reproducción hasta media hora después del corte (máx. 24 h, lo limita el proveedor).
      const { iframeUrl } = await provider().urlReproduccion(t.entradaId, { expiraEn: new Date(finEnVivo(t, funcion).getTime() + 30 * MS_MIN) });
      video = { proveedor: provider().nombre, iframeUrl };
    }
  }

  return {
    invitado: { nombre: inv.nombre },
    tienda: { nombre: tienda.nombre, logoUrl: tienda.logoUrl },
    evento: {
      nombre: funcion.evento.producto.nombre,
      imagenUrl: funcion.evento.producto.imagenes[0]?.url ?? null,
      lugar: funcion.evento.lugar
    },
    plan: t.plan,
    funcion: { nombre: funcion.nombre, inicio: funcion.inicio, fin: finEnVivo(t, funcion) },
    etapa,
    senal: esVideoPropio(t) ? t.senal : null,
    salaAbreEn: salaAbreEn(funcion),
    grabacionHasta: grabacionHasta(t, funcion),
    terminadaEn: t.terminadaEn,
    // Una sola sesión por enlace (R4.3): la página la reclama con /sesion.
    sesionUnica: esVideoPropio(t),
    video,
    // Para que la cuenta regresiva no dependa del reloj del celular.
    ahora
  };
}

/**
 * R4.3: una sola sesión activa por invitación. El dispositivo que abre la
 * página la reclama (reclamar: true) y el anterior, en su siguiente latido,
 * recibe 409 "Este enlace se abrió en otro dispositivo". El latido también
 * cuenta a los conectados y trae la señal (R4.4, "Estamos reconectando…").
 */
export async function latidoInvitado(token, tiendaIdResuelta, { sesionId, reclamar }, ahora = new Date()) {
  const inv = await invitacionDeToken(token, tiendaIdResuelta);
  const t = inv.transmision;
  if (!reclamar && inv.sesionId && inv.sesionId !== sesionId) {
    const message = "Este enlace se abrió en otro dispositivo";
    throw new ConflictError(message, { message, motivo: "OTRO_DISPOSITIVO" });
  }
  await prisma.evento_invitaciones.update({ where: { id: inv.id }, data: { sesionId, sesionVistaEn: ahora } });
  const etapa = etapaTransmision(t, t.funcion, ahora);
  // Minutos vistos estimados (un latido ≈ 30 s de video) para el costo real (R10.3).
  if (esVideoPropio(t) && etapa === "en_vivo") {
    await prisma.evento_transmisiones.update({ where: { id: t.id }, data: { minutosVistos: { increment: 0.5 } } });
  }
  return {
    etapa,
    senal: esVideoPropio(t) ? t.senal : null,
    terminadaEn: t.terminadaEn
  };
}

// ============================================
// Enlace del aviso de 15 minutos (R7.5), sin sesión
// ============================================

async function transmisionDeAccion(token) {
  const { transmisionId, tiendaId } = await verificarTokenAccion(token);
  const t = await prisma.evento_transmisiones.findFirst({
    where: { id: transmisionId, tiendaId },
    include: { funcion: { include: INCLUDE_FUNCION }, excedente: true }
  });
  if (!t || !esVideoPropio(t)) throw new NotFoundError("Transmisión", "Este enlace ya venció o no es válido");
  return t;
}

async function datosAccion(t, ahora) {
  const etapa = etapaTransmision(t, t.funcion, ahora);
  const tienda = await prisma.tiendas.findUnique({ where: { id: t.tiendaId }, select: { nombre: true, logoUrl: true } });
  return {
    tienda,
    evento: t.funcion.evento.producto.nombre,
    etapa,
    senal: t.senal,
    fin: finTransmision(t, t.funcion),
    corteEn: corteEn(t, t.funcion),
    extensionMin: t.extensionMin,
    noExtender: t.noExtender,
    terminada: !!t.terminadaEn || t.estado === "cancelada",
    opciones: enCurso(t) ? await opcionesExtension(t, ahora) : [],
    ahora
  };
}

export async function accionInfo(token, ahora = new Date()) {
  return datosAccion(await transmisionDeAccion(token), ahora);
}

export async function accionExtender(token, minutos, ahora = new Date()) {
  const t = await transmisionDeAccion(token);
  await extenderTransmision(t, minutos, { quien: `enlace del aviso${t.contactoEmail ? ` (${t.contactoEmail})` : ""}`, ahora });
  return datosAccion(await transmisionDeAccion(token), ahora);
}

export async function accionTerminarALaHora(token, ahora = new Date()) {
  const t = await transmisionDeAccion(token);
  exigirEnCurso(t);
  await noExtender(t, "enlace del aviso", ahora);
  return datosAccion(await transmisionDeAccion(token), ahora);
}

// ============================================
// Página del anfitrión (Fase 4, R8.1.1): ver y descargar la grabación
// ============================================

/**
 * Lo que ve el anfitrión con su enlace (/:slug/grabacion/:token): las partes
 * con su reproductor (mientras esté en línea) y su descarga (MP4 firmado de
 * Cloudflare, o de R2 con "Guardar 1 año"). Cualquier problema responde 404.
 */
export async function paginaAnfitrion(token, tiendaIdResuelta, ahora = new Date()) {
  const { transmisionId, tiendaId } = await verificarTokenAnfitrion(token);
  const noValido = new NotFoundError("Grabación", "Este enlace no es válido");
  if (tiendaIdResuelta && tiendaIdResuelta !== tiendaId) throw noValido;
  const t = await prisma.evento_transmisiones.findFirst({
    where: { id: transmisionId, tiendaId },
    include: { funcion: { include: INCLUDE_FUNCION }, grabaciones: { orderBy: { orden: "asc" } } }
  });
  if (!t || !esVideoPropio(t) || !t.grabar) throw noValido;
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true, logoUrl: true } });

  const vence = descargaHasta(t, t.funcion);
  const disponible = !t.grabacionBorradaEn && ahora < vence;
  return {
    tienda,
    evento: { nombre: t.funcion.evento.producto.nombre, imagenUrl: t.funcion.evento.producto.imagenes[0]?.url ?? null },
    fecha: t.funcion.inicio,
    anfitrion: t.anfitrionNombre,
    estado: !disponible ? "vencida" : !t.terminadaEn ? "pendiente" : t.grabaciones.some(g => g.estado === "procesando") ? "procesando" : "lista",
    enLineaHasta: grabacionHasta(t, t.funcion),
    descargaHasta: vence,
    guardarAnio: t.guardarAnio,
    partes: disponible ? await partesConEnlaces(t, ahora) : []
  };
}
