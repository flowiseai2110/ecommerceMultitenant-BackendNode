import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import config from "../../config/index.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { firmarTokenHoja } from "./libro.token.js";
import { avisoTiendaEmail, constanciaConsumidorEmail, respuestaConsumidorEmail } from "./libro.emails.js";
import { hojasACsv, serializeHojaAdmin, serializeHojaLista, serializeHojaStore, serializeProveedor } from "./libro.serializer.js";
import { calcularFechaLimite, fechaDate, hoyLima, sumarDiasHabiles, UMBRAL_POR_VENCER } from "./plazos.js";

/**
 * Libro de Reclamaciones virtual (docs/specs/libro-reclamaciones).
 *
 * La hoja es un documento legal: lo que registró el consumidor no se edita ni
 * se borra (trigger SQL). Acá solo se crea, se marca "en atención" y se
 * responde. Cada paso deja un evento en libro_reclamaciones_eventos.
 */

const SELECT_TIENDA = {
  id: true, slug: true, nombre: true, email: true, moneda: true, activo: true,
  ruc: true, razonSocial: true, direccionFiscal: true, direccion: true
};

const ABIERTAS = { in: ["pendiente", "en_atencion"] };

/** Error 502 con motivo visible: el errorHandler solo expone details. */
class EmailNoEnviadoError extends AppError {
  constructor(motivo) {
    super("No se pudo enviar el correo", 502, "EMAIL_NO_ENVIADO", { motivo });
  }
}

async function tiendaActiva(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  if (!tienda || !tienda.activo) throw new NotFoundError("Tienda");
  return tienda;
}

/** sha256(ip + sal). Sin sal configurada no se guarda nada. */
export function hashIp(ip, salt = config.libro.ipSalt) {
  if (!ip || !salt) return null;
  return crypto.createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

/** "ped-12", "12", " PED-0012 " → "PED-0012" (formato de #generarNumeroPedido). */
export function normalizarNumeroPedido(texto) {
  if (!texto) return null;
  const limpio = texto.trim().toUpperCase().replace(/\s+/g, "");
  const digitos = limpio.match(/^(?:PED-?)?(\d{1,8})$/)?.[1];
  return digitos ? `PED-${digitos.padStart(4, "0")}` : limpio;
}

/**
 * Enlaza la hoja a un pedido real de la tienda, sin revelar nada al consumidor
 * (R2.4): con sesión, solo si el pedido es suyo; sin sesión, por el número que
 * escribió. Si no coincide, queda solo el texto.
 */
async function resolverPedido(tiendaId, { pedidoId, numeroPedidoTexto, authUserId }) {
  if (pedidoId && authUserId) {
    const pedido = await prisma.pedidos.findFirst({
      where: { id: pedidoId, tiendaId, authUserId },
      select: { id: true, numeroPedido: true }
    });
    if (pedido) return { pedidoId: pedido.id, numeroPedidoTexto: numeroPedidoTexto || pedido.numeroPedido };
  }
  if (numeroPedidoTexto) {
    const pedido = await prisma.pedidos.findFirst({
      where: { tiendaId, numeroPedido: normalizarNumeroPedido(numeroPedidoTexto) },
      select: { id: true }
    });
    return { pedidoId: pedido?.id ?? null, numeroPedidoTexto };
  }
  return { pedidoId: null, numeroPedidoTexto: null };
}

// ============================================
// Store
// ============================================

export async function obtenerProveedor(tiendaId) {
  return serializeProveedor(await tiendaActiva(tiendaId));
}

/**
 * Registra una hoja con correlativo por tienda y año (R3.1). El advisory lock
 * serializa los registros concurrentes de la misma tienda; el índice único
 * (tienda, anio, correlativo) es la red de seguridad.
 *
 * @param {object} datos - crearHojaSchema validado
 * @param {{ authUserId?: string|null, ip?: string, now?: Date }} [ctx]
 * @returns {Promise<{ hoja: object, tienda: object }>} hoja = fila de Prisma
 */
export async function registrarHoja(datos, { authUserId = null, ip = null, now = new Date() } = {}) {
  const tienda = await tiendaActiva(datos.tiendaId);
  const { pedidoId, numeroPedidoTexto } = await resolverPedido(tienda.id, {
    pedidoId: datos.pedidoId, numeroPedidoTexto: datos.numeroPedidoTexto, authUserId
  });

  const anio = Number(hoyLima(now).slice(0, 4));
  const fechaLimite = calcularFechaLimite(now);
  const proveedor = serializeProveedor(tienda);

  const hoja = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`libro_${tienda.id}_${anio}`}))`;
    const [{ max }] = await tx.$queryRaw`
      SELECT COALESCE(MAX(correlativo), 0) AS max
      FROM libro_reclamaciones
      WHERE tienda_id = ${tienda.id}::uuid AND anio = ${anio}
    `;
    const correlativo = Number(max) + 1;

    return tx.libro_reclamaciones.create({
      data: {
        tiendaId: tienda.id,
        anio,
        correlativo,
        numero: `${String(correlativo).padStart(5, "0")}-${anio}`,
        tipo: datos.tipo,
        fechaLimite: fechaDate(fechaLimite),
        proveedorNombre: proveedor.nombre,
        proveedorRazonSocial: proveedor.razonSocial,
        proveedorRuc: proveedor.ruc,
        proveedorDireccion: proveedor.direccion,
        consumidorNombres: datos.consumidorNombres,
        consumidorApellidos: datos.consumidorApellidos,
        consumidorDocTipo: datos.consumidorDocTipo,
        consumidorDocNumero: datos.consumidorDocNumero.toUpperCase(),
        consumidorDomicilio: datos.consumidorDomicilio,
        consumidorTelefono: datos.consumidorTelefono,
        consumidorEmail: datos.consumidorEmail,
        esMenor: datos.esMenor,
        apoderadoNombre: datos.esMenor ? datos.apoderadoNombre : null,
        apoderadoDocTipo: datos.esMenor ? datos.apoderadoDocTipo : null,
        apoderadoDocNumero: datos.esMenor ? datos.apoderadoDocNumero?.toUpperCase() : null,
        bienTipo: datos.bienTipo,
        bienDescripcion: datos.bienDescripcion,
        montoReclamado: datos.montoReclamado,
        moneda: proveedor.moneda,
        pedidoId,
        numeroPedidoTexto,
        detalle: datos.detalle,
        pedidoConsumidor: datos.pedidoConsumidor,
        medioRespuesta: datos.medioRespuesta,
        aceptaDeclaracion: true,
        authUserId,
        ipHash: hashIp(ip),
        fechaRegistro: now,
        usuarioRegistro: authUserId ?? "consumidor",
        eventos: { create: { tipo: "registrada", usuario: authUserId ?? "consumidor" } }
      }
    });
  });

  logger.info(`📕 Libro de Reclamaciones: hoja ${hoja.numero} registrada en la tienda ${tienda.slug}`);
  return { hoja, tienda };
}

export function urlConstancia(slug, token) {
  return urlTienda(slug, `libro-reclamaciones/hoja/${token}`);
}

async function registrarEvento(hojaId, tipo, detalle = null, usuario = "sistema") {
  try {
    await prisma.libro_reclamaciones_eventos.create({ data: { hojaId, tipo, detalle, usuario } });
  } catch (error) {
    logger.error(`❌ Libro de Reclamaciones: no se pudo registrar el evento ${tipo} de la hoja ${hojaId}:`, error);
  }
}

/**
 * Constancia al consumidor (R4.2) y aviso a la tienda (R7.2). Nunca lanza: la
 * hoja ya está registrada y la pantalla de constancia es la prueba principal
 * (R4.4). Cada resultado queda como evento.
 */
export async function notificarRegistro(hoja, tienda, token) {
  const dto = serializeHojaAdmin(hoja);
  const url = urlConstancia(tienda.slug, token);

  const constancia = constanciaConsumidorEmail(dto, url);
  const aviso = avisoTiendaEmail(dto);

  const [rConsumidor, rTienda] = await Promise.allSettled([
    sendTransactionalEmail({ to: hoja.consumidorEmail, ...constancia, replyTo: tienda.email || undefined }),
    tienda.email
      ? sendTransactionalEmail({ to: tienda.email, ...aviso, replyTo: hoja.consumidorEmail })
      : Promise.reject(new Error("La tienda no tiene correo configurado"))
  ]);

  await registrarEvento(hoja.id,
    rConsumidor.status === "fulfilled" ? "constancia_enviada" : "constancia_fallo",
    rConsumidor.status === "fulfilled" ? { messageId: rConsumidor.value.messageId } : { error: rConsumidor.reason?.message });
  await registrarEvento(hoja.id,
    rTienda.status === "fulfilled" ? "aviso_tienda_enviado" : "aviso_tienda_fallo",
    rTienda.status === "fulfilled" ? { messageId: rTienda.value.messageId } : { error: rTienda.reason?.message });
}

/**
 * Hoja por id + tienda, para el enlace de la constancia (el token ya se verificó).
 */
export async function obtenerHojaPublica(tiendaId, hojaId) {
  const hoja = await prisma.libro_reclamaciones.findFirst({ where: { id: hojaId, tiendaId } });
  if (!hoja) throw new NotFoundError("Hoja de reclamación", "Hoja de reclamación no encontrada");
  return serializeHojaStore(hoja);
}

// ============================================
// Admin
// ============================================

/** Inicio del día de Lima (Perú no tiene horario de verano: siempre -05:00). */
const inicioDiaLima = (iso) => new Date(`${iso}T00:00:00-05:00`);
const siguienteDia = (iso) => new Date(inicioDiaLima(iso).getTime() + 24 * 60 * 60 * 1000);

/**
 * Traduce el semáforo a rangos de fecha_limite para usar el índice
 * (tienda, estado, fecha_limite). Coincide con plazos.semaforo().
 */
function whereSemaforo(semaforo, hoy) {
  const umbral = fechaDate(sumarDiasHabiles(hoy, UMBRAL_POR_VENCER));
  const hoyDate = fechaDate(hoy);
  const filtro = {
    rojo: { lte: hoyDate },
    ambar: { gt: hoyDate, lte: umbral },
    verde: { gt: umbral }
  }[semaforo];
  return { estado: ABIERTAS, fechaLimite: filtro };
}

function whereFiltros(tiendaId, { estado, tipo, semaforo, desde, hasta, q } = {}, hoy) {
  const and = [{ tiendaId }];
  if (estado === "abiertas") and.push({ estado: ABIERTAS });
  else if (estado) and.push({ estado });
  if (tipo) and.push({ tipo });
  if (semaforo) and.push(whereSemaforo(semaforo, hoy));
  if (desde || hasta) {
    and.push({
      fechaRegistro: {
        ...(desde ? { gte: inicioDiaLima(desde) } : {}),
        ...(hasta ? { lt: siguienteDia(hasta) } : {})
      }
    });
  }
  if (q) {
    const contiene = { contains: q, mode: "insensitive" };
    and.push({
      OR: [
        { numero: contiene },
        { consumidorNombres: contiene },
        { consumidorApellidos: contiene },
        { consumidorDocNumero: contiene },
        { consumidorEmail: contiene },
        { numeroPedidoTexto: contiene }
      ]
    });
  }
  return { AND: and };
}

/**
 * Bandeja (R6.2). Las abiertas se ordenan por fecha límite (lo más urgente
 * arriba); el resto, por fecha de registro.
 */
export async function listarHojasAdmin(tiendaId, filtros = {}, hoy = hoyLima()) {
  const { page = 1, limit = 20 } = filtros;
  const where = whereFiltros(tiendaId, filtros, hoy);
  const orderBy = filtros.estado === "abiertas" || filtros.estado === "pendiente" || filtros.estado === "en_atencion" || filtros.semaforo
    ? [{ fechaLimite: "asc" }, { fechaRegistro: "asc" }]
    : [{ fechaRegistro: "desc" }];

  const [total, filas] = await Promise.all([
    prisma.libro_reclamaciones.count({ where }),
    prisma.libro_reclamaciones.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit })
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: filas.map(h => serializeHojaLista(h, hoy)),
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
  };
}

/** Conteos para el badge del menú (R6.1). */
export async function resumenHojas(tiendaId, hoy = hoyLima()) {
  const [abiertas, porVencer, vencidas] = await Promise.all([
    prisma.libro_reclamaciones.count({ where: { tiendaId, estado: ABIERTAS } }),
    prisma.libro_reclamaciones.count({ where: { tiendaId, ...whereSemaforo("ambar", hoy) } }),
    prisma.libro_reclamaciones.count({ where: { tiendaId, ...whereSemaforo("rojo", hoy) } })
  ]);
  return { abiertas, porVencer, vencidas };
}

const INCLUDE_DETALLE = {
  pedido: { select: { id: true, numeroPedido: true, estado: true, total: true } },
  eventos: { orderBy: { fechaRegistro: "asc" } }
};

async function hojaDeTienda(tiendaId, id, include = undefined) {
  const hoja = await prisma.libro_reclamaciones.findFirst({ where: { id, tiendaId }, include });
  if (!hoja) throw new NotFoundError("Hoja de reclamación", "Hoja de reclamación no encontrada");
  return hoja;
}

export async function detalleHoja(tiendaId, id, hoy = hoyLima()) {
  return serializeHojaAdmin(await hojaDeTienda(tiendaId, id, INCLUDE_DETALLE), hoy);
}

/** Marca interna "en atención" (R6.4). Solo desde pendiente. */
export async function marcarEnAtencion(tiendaId, id, user) {
  const hoja = await hojaDeTienda(tiendaId, id);
  if (hoja.estado !== "pendiente") {
    throw new ConflictError("La hoja no está pendiente", { motivo: "ESTADO_INVALIDO", estado: hoja.estado });
  }
  const usuario = user?.email ?? user?.id ?? null;
  await prisma.$transaction([
    prisma.libro_reclamaciones.updateMany({
      where: { id, tiendaId, estado: "pendiente" },
      data: { estado: "en_atencion", fechaActualizacion: new Date(), usuarioActualizacion: usuario }
    }),
    prisma.libro_reclamaciones_eventos.create({ data: { hojaId: id, tipo: "en_atencion", usuario } })
  ]);
  return detalleHoja(tiendaId, id);
}

/**
 * Hoja tal como quedaría respondida, para la vista previa y el correo.
 * @returns {object} serializeHojaAdmin con `respuesta`
 */
function conRespuesta(hoja, { respuesta, accionAdoptada, fecha, respondidoPor }) {
  return serializeHojaAdmin({
    ...hoja,
    estado: "respondida",
    respuesta,
    accionAdoptada: accionAdoptada ?? null,
    fechaRespuesta: fecha,
    respondidoPor
  });
}

/** HTML del correo que recibiría el consumidor (R6.7). */
export async function vistaPreviaRespuesta(tiendaId, id, { respuesta, accionAdoptada }) {
  const hoja = await hojaDeTienda(tiendaId, id);
  const dto = conRespuesta(hoja, { respuesta: respuesta || "…", accionAdoptada, fecha: new Date(), respondidoPor: null });
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  const url = tienda ? urlConstancia(tienda.slug, "vista-previa") : null;
  return respuestaConsumidorEmail(dto, url);
}

/**
 * Responde la hoja (R6.5 / R6.6). Con medio email, el UPDATE condicional
 * bloquea la fila y el correo se envía DENTRO de la transacción: si Resend
 * falla, rollback y la hoja sigue abierta; si dos admins responden a la vez,
 * el segundo recibe 409 y no sale un segundo correo.
 */
export async function responderHoja(tiendaId, id, { respuesta, accionAdoptada, fechaEntregaCarta }, user) {
  const hoja = await hojaDeTienda(tiendaId, id);
  if (hoja.estado === "respondida") {
    throw new ConflictError("La hoja ya fue respondida", { motivo: "YA_RESPONDIDA" });
  }

  const porCorreo = hoja.medioRespuesta === "email";
  if (!porCorreo && !fechaEntregaCarta) {
    throw new ValidationError("Falta la fecha de entrega de la carta", {
      motivo: "FALTA_FECHA_CARTA", message: "Indica la fecha en que se entregó la carta al domicilio del consumidor"
    });
  }
  if (!porCorreo && (fechaEntregaCarta < hoyLima(new Date(hoja.fechaRegistro)) || fechaEntregaCarta > hoyLima())) {
    throw new ValidationError("Fecha de entrega inválida", {
      motivo: "FECHA_CARTA_INVALIDA", message: "La fecha de entrega debe estar entre el registro de la hoja y hoy"
    });
  }

  const usuario = user?.email ?? user?.id ?? null;
  // La carta se fecha al mediodía de Lima del día indicado.
  const fecha = porCorreo ? new Date() : new Date(`${fechaEntregaCarta}T12:00:00-05:00`);
  const dto = conRespuesta(hoja, { respuesta, accionAdoptada, fecha, respondidoPor: usuario });

  let tienda = null;
  if (porCorreo) {
    tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true, email: true } });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.libro_reclamaciones.updateMany({
        where: { id, tiendaId, estado: ABIERTAS },
        data: {
          estado: "respondida",
          respuesta,
          accionAdoptada: accionAdoptada ?? null,
          fechaRespuesta: fecha,
          respondidoPor: usuario,
          fechaActualizacion: new Date(),
          usuarioActualizacion: usuario
        }
      });
      if (count === 0) throw new ConflictError("La hoja ya fue respondida", { motivo: "YA_RESPONDIDA" });

      let messageId = null;
      if (porCorreo) {
        const token = await firmarTokenHoja({ hojaId: id, tiendaId });
        const email = respuestaConsumidorEmail(dto, urlConstancia(tienda.slug, token));
        try {
          ({ messageId } = await sendTransactionalEmail({
            to: hoja.consumidorEmail, ...email, replyTo: tienda.email || undefined
          }));
        } catch (error) {
          throw new EmailNoEnviadoError(error.message);
        }
      }

      await tx.libro_reclamaciones_eventos.create({
        data: {
          hojaId: id,
          tipo: "respondida",
          usuario,
          detalle: porCorreo ? { medio: "email", messageId } : { medio: "domicilio", fechaEntregaCarta }
        }
      });
    }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof EmailNoEnviadoError) {
      logger.error(`❌ Libro de Reclamaciones: no se envió la respuesta de la hoja ${hoja.numero}: ${error.details.motivo}`);
      await registrarEvento(id, "respuesta_fallo", { error: error.details.motivo }, usuario);
    }
    throw error;
  }

  return detalleHoja(tiendaId, id);
}

/** CSV de un rango de fechas de registro (R6.8). Tope de 5 000 filas por descarga. */
export async function exportarHojasCsv(tiendaId, { desde, hasta } = {}) {
  const where = whereFiltros(tiendaId, { desde, hasta });
  const hojas = await prisma.libro_reclamaciones.findMany({ where, orderBy: { fechaRegistro: "asc" }, take: 5000 });
  return hojasACsv(hojas);
}
