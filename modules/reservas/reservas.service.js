import { prisma, Prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { generarNumeroPedido, upsertCliente } from "../ordenes/pedidos.service.js";
import { cotizarHotel, montoACuenta } from "./hotel/cotizar.js";
import { ESTADOS_EN_CURSO, transicionar, estadoEfectivo } from "./estados.js";
import { obtenerConfig } from "./reservas.config.service.js";
import { cierresDeProducto } from "./cierres.service.js";
import { cargarHabitacionParaReserva } from "./hotel/habitaciones.service.js";
import { firmarTokenReserva } from "./reservas.token.js";
import { subirCaptura, urlCaptura } from "./reservas.capturas.js";
import { serializeReservaAdmin, serializeReservaLista, serializeReservaStore } from "./reservas.serializer.js";
import {
  aceptadaEmail, confirmadaEmail, nuevaSolicitudEmail, pagoSubidoEmail, rechazadaEmail, solicitudRecibidaEmail
} from "./reservas.emails.js";
import { instanteLima, fechaLima, sumarDias } from "./tiempo.js";

/**
 * Mini booking — reservas de hotel / hostal (docs/specs/mini-booking).
 *
 * Una reserva es un `pedidos` (tipo = hotel: dinero, cliente, comprobante,
 * número) + una fila en `reservas` (estadía y titular). No hay inventario: el
 * negocio acepta o rechaza. Lo no atendido a la hora de inicio se anula y lo
 * confirmado pasa a completado al terminar; ambas cosas se calculan al leer.
 */

const SELECT_TIENDA = {
  id: true, slug: true, nombre: true, email: true, whatsappNumero: true, direccion: true,
  logoUrl: true, activo: true, tipoNegocio: true
};

const INCLUDE_RESERVA = {
  reserva: {
    include: {
      producto: {
        select: {
          id: true, nombre: true, slug: true,
          imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 }
        }
      },
      modalidad: true
    }
  },
  detalles: true,
  pagos: { orderBy: { fechaRegistro: "asc" } },
  historialEstados: { orderBy: { fechaRegistro: "asc" } }
};

const MOTIVOS_RECHAZO = {
  sin_disponibilidad: "No hay disponibilidad para esa fecha",
  fecha_cerrada: "El hotel no recibe reservas esa fecha"
};

const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const redondear = (n) => Math.round(n * 100) / 100;

async function tiendaDeReservas(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  if (!tienda || !tienda.activo) throw new NotFoundError("Tienda");
  if (tienda.tipoNegocio !== "hotel") {
    throw new ValidationError("Esta tienda no recibe reservas de habitaciones", { message: "Esta tienda no recibe reservas de habitaciones", motivo: "TIENDA_SIN_RESERVAS" });
  }
  return tienda;
}

async function metodosPagoActivos(tiendaId) {
  const metodos = await prisma.metodos_pago.findMany({
    where: { tiendaId, activo: true },
    orderBy: { orden: "asc" },
    select: { id: true, nombre: true, tipo: true, instrucciones: true, cuentaInfo: true }
  });
  return metodos;
}

export function urlSeguimiento(slug, token) {
  return urlTienda(slug, `reserva/${token}`);
}

/**
 * Persiste lo que ya venció o terminó (spec R5.6, R8.5). Es solo higiene: la
 * lectura usa `estadoEfectivo` y es correcta aunque esto no corra nunca.
 */
export async function persistirVencimientos(tiendaId) {
  await prisma.$executeRaw`
    UPDATE pedidos p SET estado = 'vencida', fecha_actualizacion = now()
    FROM reservas r
    WHERE r.pedido_id = p.id AND p.tienda_id = ${tiendaId}::uuid
      AND p.estado IN ('solicitada', 'aceptada') AND r.inicio <= now()`;
  await prisma.$executeRaw`
    UPDATE pedidos p SET estado = 'completada', fecha_actualizacion = now()
    FROM reservas r
    WHERE r.pedido_id = p.id AND p.tienda_id = ${tiendaId}::uuid
      AND p.estado = 'confirmada' AND COALESCE(r.fin, r.inicio) <= now()`;
}

async function pedidoDeReserva(tiendaId, pedidoId, client = prisma) {
  const pedido = await client.pedidos.findFirst({
    where: { id: pedidoId, tiendaId, reserva: { isNot: null } },
    include: INCLUDE_RESERVA
  });
  if (!pedido) throw new NotFoundError("Reserva", "Reserva no encontrada");
  return pedido;
}

/**
 * Aplica una acción de la máquina de estados sobre el estado EFECTIVO (una
 * solicitada vencida ya no se puede aceptar). El UPDATE condicionado al estado
 * leído evita que dos personas del equipo actúen a la vez sobre la misma
 * reserva: la segunda recibe 409.
 */
async function aplicarAccion(tx, pedido, accion, { ahora = new Date(), datosPedido = {}, nota = null } = {}) {
  const r = pedido.reserva;
  const efectivo = estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin }, ahora);
  const nuevo = transicionar(efectivo, accion);
  const { count } = await tx.pedidos.updateMany({
    where: { id: pedido.id, tiendaId: pedido.tiendaId, estado: pedido.estado },
    data: { estado: nuevo, fechaActualizacion: ahora, ...datosPedido }
  });
  if (count === 0) {
    throw new ConflictError("La reserva cambió mientras la revisabas. Actualiza la página.", { message: "La reserva cambió mientras la revisabas. Actualiza la página.", motivo: "RESERVA_MODIFICADA" });
  }
  await tx.pedido_historial_estados.create({ data: { pedidoId: pedido.id, estado: nuevo, notas: nota } });
  return nuevo;
}

/** Envía un correo sin bloquear ni lanzar: el link de seguimiento es la fuente de verdad. */
function enviar(destino, correo, replyTo) {
  if (!destino) return;
  sendTransactionalEmail({ to: destino, ...correo, replyTo: replyTo || undefined })
    .catch(error => logger.warn(`📭 Reservas: no se envió "${correo.subject}" a ${destino}: ${error.message}`));
}

// ============================================
// Store
// ============================================

/**
 * Cotización para la vitrina: total, desglose, salida calculada, aviso de
 * reserva próxima y errores de reglas (sin crear nada).
 */
export async function cotizar(datos, ahora = new Date()) {
  await tiendaDeReservas(datos.tiendaId);
  const config = await obtenerConfig(datos.tiendaId);
  const { tipo, modalidad } = await cargarHabitacionParaReserva(datos.tiendaId, datos.productoId, datos.modalidadId);
  const cotizacion = await cotizarConCierres({ datos, tipo, modalidad, config, ahora });
  return serializarCotizacion(cotizacion);
}

async function cotizarConCierres({ datos, tipo, modalidad, config, ahora }) {
  const desde = datos.fecha;
  const hasta = sumarDias(datos.fecha, Math.max(datos.noches ?? 1, 1));
  const cierres = await cierresDeProducto(datos.tiendaId, datos.productoId, desde, hasta);
  const cotizacion = cotizarHotel({
    tipo, modalidad, fecha: datos.fecha, hora: datos.hora, noches: datos.noches,
    adultos: datos.adultos, ninos: datos.ninos, cierres, config, ahora
  });
  if (modalidad.tipo === "horas" && !datos.hora) {
    cotizacion.errores.unshift({ codigo: "HORA_REQUERIDA", mensaje: "Indica la hora de ingreso", campo: "hora" });
  }
  if (modalidad.tipo === "noche" && !datos.noches) {
    cotizacion.errores.unshift({ codigo: "NOCHES_REQUERIDAS", mensaje: "Indica cuántas noches", campo: "noches" });
  }
  return cotizacion;
}

const serializarCotizacion = (c) => ({
  inicio: c.inicio, fin: c.fin, noches: c.noches, horas: c.horas, lineas: c.lineas,
  total: c.total, montoAPagar: c.montoAPagar, saldoDestino: c.saldoDestino, aviso: c.aviso, errores: c.errores
});

/** Máximo de solicitudes en curso por cliente (por WhatsApp o documento), spec R5.7. */
async function validarSolicitudesAbiertas(tiendaId, { whatsapp, docNumero }, max, ahora) {
  const abiertas = await prisma.pedidos.count({
    where: {
      tiendaId,
      tipo: "hotel",
      estado: { in: ESTADOS_EN_CURSO },
      reserva: { inicio: { gt: ahora } },
      OR: [{ clienteWhatsapp: whatsapp }, { reserva: { titularDocNumero: docNumero } }]
    }
  });
  if (abiertas >= max) {
    throw new ValidationError(`Ya tienes ${abiertas} solicitudes en curso en este hotel. Espera la respuesta o cancela alguna.`, { message: `Ya tienes ${abiertas} solicitudes en curso en este hotel. Espera la respuesta o cancela alguna.`,
      motivo: "MAX_SOLICITUDES_ABIERTAS"
    });
  }
}

/**
 * Crea la solicitud de reserva (spec R5). Idempotente por `idempotencyKey`: un
 * doble clic o un reintento devuelve la misma reserva.
 *
 * @returns {Promise<{ pedido: object, tienda: object, config: object, token: string, nueva: boolean }>}
 */
export async function crearSolicitud(datos, { authUserId = null, ahora = new Date() } = {}) {
  const tienda = await tiendaDeReservas(datos.tiendaId);

  const existente = await prisma.pedidos.findFirst({
    where: { tiendaId: tienda.id, idempotencyKey: datos.idempotencyKey },
    select: { id: true }
  });
  if (existente) return resultadoSolicitud(tienda, existente.id, false);

  const config = await obtenerConfig(tienda.id);
  const { producto, tipo, modalidad } = await cargarHabitacionParaReserva(tienda.id, datos.productoId, datos.modalidadId);
  const c = await cotizarConCierres({ datos, tipo, modalidad, config, ahora });
  if (c.errores.length) {
    throw new ValidationError(c.errores[0].mensaje, { motivo: "RESERVA_NO_VALIDA", errores: c.errores });
  }

  const whatsapp = datos.whatsapp.replace(/[\s-]/g, "");
  const docNumero = datos.titular.docNumero.toUpperCase();
  await validarSolicitudesAbiertas(tienda.id, { whatsapp, docNumero }, config.maxSolicitudesAbiertas, ahora);

  const estadoInicial = config.modoConfirmacion === "pago_directo" ? "aceptada" : "solicitada";
  const nombreCompleto = `${datos.titular.nombres} ${datos.titular.apellidos}`;

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const numeroPedido = await generarNumeroPedido(tienda.id, tx);
      const cliente = await upsertCliente(tienda.id, {
        whatsappNumero: whatsapp, nombre: nombreCompleto, email: datos.email,
        tipoDocumento: datos.titular.docTipo, numeroDocumento: docNumero
      }, tx);

      return tx.pedidos.create({
        data: {
          tiendaId: tienda.id,
          clienteId: cliente.id,
          clienteNombre: nombreCompleto,
          clienteWhatsapp: whatsapp,
          clienteEmail: datos.email,
          authUserId,
          numeroPedido,
          tipo: "hotel",
          estado: estadoInicial,
          estadoPago: "pendiente",
          fechaServicio: c.inicio,
          subtotal: c.total,
          total: c.total,
          notas: datos.comentarios,
          origen: "web",
          idempotencyKey: datos.idempotencyKey,
          // Solo la intención: el hotel emite el comprobante con su sistema (R14.3).
          comprobante: datos.factura ? "factura" : null,
          comprobanteDocTipo: datos.factura ? "RUC" : null,
          comprobanteDocNumero: datos.factura?.ruc ?? null,
          razonSocial: datos.factura?.razonSocial ?? null,
          direccionFiscal: datos.factura?.direccionFiscal ?? null,
          fechaRegistro: ahora,
          usuarioRegistro: "storefront",
          detalles: {
            createMany: {
              data: c.lineas.map(l => ({
                productoId: producto.id,
                productoNombre: producto.nombre,
                varianteNombre: l.descripcion,
                cantidad: l.cantidad,
                precioUnitario: l.precioUnitario,
                total: l.total
              }))
            }
          },
          historialEstados: {
            create: {
              estado: estadoInicial,
              notas: estadoInicial === "solicitada" ? "Solicitud enviada desde la vitrina" : "Reserva con pago directo desde la vitrina"
            }
          },
          reserva: {
            create: {
              tiendaId: tienda.id,
              tipo: "hotel",
              productoId: producto.id,
              modalidadId: modalidad.id,
              inicio: c.inicio,
              fin: c.fin,
              noches: c.noches,
              horas: c.horas,
              adultos: datos.adultos,
              ninos: datos.ninos,
              titularNombres: datos.titular.nombres,
              titularApellidos: datos.titular.apellidos,
              titularDocTipo: datos.titular.docTipo,
              titularDocNumero: docNumero,
              titularNacionalidad: datos.titular.nacionalidad,
              titularNacimiento: datos.titular.nacimiento ? new Date(`${datos.titular.nacimiento}T00:00:00Z`) : null,
              acompanantes: datos.acompanantes.length
                ? datos.acompanantes.map(a => ({ ...a, docNumero: a.docNumero.toUpperCase() }))
                : undefined,
              comentarios: datos.comentarios,
              aceptaDatos: true,
              montoAPagar: c.montoAPagar,
              saldoDestino: c.saldoDestino
            }
          }
        },
        select: { id: true }
      });
    }, { maxWait: 5000, timeout: 15000 });

    logger.info(`🛎️ Reservas: solicitud en ${tienda.slug} (${modalidad.tipo}, ingreso ${c.inicio.toISOString()})`);
    return resultadoSolicitud(tienda, pedido.id, true, config);
  } catch (error) {
    // Carrera de dos envíos con la misma clave: el índice único gana, se devuelve la primera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previa = await prisma.pedidos.findFirst({
        where: { tiendaId: tienda.id, idempotencyKey: datos.idempotencyKey }, select: { id: true }
      });
      if (previa) return resultadoSolicitud(tienda, previa.id, false);
    }
    throw error;
  }
}

async function resultadoSolicitud(tienda, pedidoId, nueva, config = null) {
  const pedido = await pedidoDeReserva(tienda.id, pedidoId);
  const token = await firmarTokenReserva({ pedidoId, tiendaId: tienda.id });
  return { pedido, tienda, config: config ?? await obtenerConfig(tienda.id), token, nueva };
}

/** Avisos de una solicitud nueva: al cliente y al negocio (R5.5). Nunca lanza. */
export function notificarSolicitud({ pedido, tienda, config, token }) {
  const dtoCliente = serializeReservaStore(pedido, { tienda, config });
  const dtoNegocio = serializeReservaAdmin(pedido);
  enviar(pedido.clienteEmail, solicitudRecibidaEmail(dtoCliente, urlSeguimiento(tienda.slug, token)), tienda.email);
  enviar(tienda.email, nuevaSolicitudEmail(dtoNegocio), pedido.clienteEmail);
}

/** Página de seguimiento (estado, pago, confirmación). */
export async function obtenerSeguimiento(tiendaId, pedidoId, ahora = new Date()) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  if (!tienda) throw new NotFoundError("Reserva", "Reserva no encontrada");
  const [pedido, config, metodosPago] = await Promise.all([
    pedidoDeReserva(tiendaId, pedidoId), obtenerConfig(tiendaId), metodosPagoActivos(tiendaId)
  ]);
  return serializeReservaStore(pedido, { tienda, config, metodosPago, ahora });
}

/** El cliente cancela una solicitud o una aceptada sin pagar (R12.1). */
export async function cancelarPorCliente(tiendaId, pedidoId, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  await prisma.$transaction(tx =>
    aplicarAccion(tx, pedido, "cancelar_cliente", { ahora, nota: "Cancelada por el cliente" }));
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

/**
 * El cliente sube la captura del pago manual (R7.2). Se puede volver a subir
 * mientras está en revisión (por ejemplo, si se equivocó de imagen).
 */
export async function subirCapturaCliente(tiendaId, pedidoId, { file, metodo, numeroOperacion }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  // Valida antes de subir el archivo: una reserva vencida no acepta pagos.
  transicionar(estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin }, ahora), "subir_captura");

  const capturaPath = await subirCaptura({ tiendaId, pedidoId, file });
  await prisma.$transaction(async (tx) => {
    await tx.pagos.create({
      data: {
        tiendaId,
        pedidoId,
        proveedor: "manual",
        metodo,
        monto: r.montoAPagar,
        moneda: "PEN",
        estado: "pendiente",
        metadata: { capturaPath, numeroOperacion },
        fechaRegistro: ahora,
        usuarioRegistro: "storefront"
      }
    });
    await aplicarAccion(tx, pedido, "subir_captura", {
      ahora,
      datosPedido: { metodoPago: metodo, referenciaPago: numeroOperacion },
      nota: `Captura de pago subida (${metodo}${numeroOperacion ? ` · Op. ${numeroOperacion}` : ""})`
    });
  });

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  enviar(tienda.email, pagoSubidoEmail(serializeReservaAdmin(await pedidoDeReserva(tiendaId, pedidoId))), pedido.clienteEmail);
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

// ============================================
// Admin
// ============================================

function wherePestana(pestana, ahora) {
  switch (pestana) {
    case "por_responder": return { estado: "solicitada", reserva: { inicio: { gt: ahora } } };
    case "pago_por_verificar": return { estado: "pago_en_revision" };
    // Próximas: aceptadas esperando pago y confirmadas que aún no terminan.
    case "confirmadas": return {
      OR: [
        { estado: "aceptada", reserva: { inicio: { gt: ahora } } },
        { estado: "confirmada", reserva: { fin: { gt: ahora } } }
      ]
    };
    default: return {
      estado: { in: ["completada", "rechazada", "vencida", "cancelada", "no_show"] }
    };
  }
}

/** Bandeja (R11.1): las abiertas, por hora de inicio; el historial, lo más reciente primero. */
export async function listarReservasAdmin(tiendaId, filtros, ahora = new Date()) {
  await persistirVencimientos(tiendaId);
  const { pestana, productoId, desde, hasta, q, page, limit } = filtros;

  const and = [{ tiendaId, tipo: "hotel" }, wherePestana(pestana, ahora)];
  if (productoId) and.push({ reserva: { productoId } });
  if (desde || hasta) {
    and.push({
      fechaServicio: {
        ...(desde ? { gte: instanteLima(desde) } : {}),
        ...(hasta ? { lt: instanteLima(sumarDias(hasta, 1)) } : {})
      }
    });
  }
  if (q) {
    const contiene = { contains: q, mode: "insensitive" };
    and.push({
      OR: [
        { numeroPedido: contiene },
        { clienteNombre: contiene },
        { clienteWhatsapp: contiene },
        { reserva: { titularDocNumero: contiene } }
      ]
    });
  }
  const where = { AND: and };
  const orderBy = pestana === "historial" ? [{ fechaServicio: "desc" }] : [{ fechaServicio: "asc" }];

  const [total, filas] = await Promise.all([
    prisma.pedidos.count({ where }),
    prisma.pedidos.findMany({
      where, orderBy, skip: (page - 1) * limit, take: limit,
      include: { reserva: { include: INCLUDE_RESERVA.reserva.include }, pagos: true, detalles: true }
    })
  ]);
  const totalPages = Math.ceil(total / limit);
  return {
    data: filas.map(p => serializeReservaLista(p, ahora)),
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
  };
}

/** Badge del menú (R11.2): lo que espera una acción del negocio. */
export async function resumenReservas(tiendaId, ahora = new Date()) {
  const [porResponder, pagoPorVerificar] = await Promise.all([
    prisma.pedidos.count({ where: { tiendaId, tipo: "hotel", estado: "solicitada", reserva: { inicio: { gt: ahora } } } }),
    prisma.pedidos.count({ where: { tiendaId, tipo: "hotel", estado: "pago_en_revision" } })
  ]);
  return { porResponder, pagoPorVerificar, total: porResponder + pagoPorVerificar };
}

/** Detalle para el negocio, con la URL firmada de cada captura. */
export async function detalleReservaAdmin(tiendaId, pedidoId, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const urlsCaptura = new Map(await Promise.all(
    pedido.pagos.filter(p => p.metadata?.capturaPath).map(async p => [p.id, await urlCaptura(p.metadata.capturaPath)])
  ));
  return serializeReservaAdmin(pedido, { urlsCaptura, ahora });
}

async function correoCliente(tiendaId, pedidoId, plantilla) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  const [pedido, config] = await Promise.all([pedidoDeReserva(tiendaId, pedidoId), obtenerConfig(tiendaId)]);
  const token = await firmarTokenReserva({ pedidoId, tiendaId });
  const dto = serializeReservaStore(pedido, { tienda, config });
  enviar(pedido.clienteEmail, plantilla(dto, urlSeguimiento(tienda.slug, token)), tienda.email);
}

/** Aceptar (R6.1, R6.2), con ajuste opcional del total (R6.4). */
export async function aceptarReserva(tiendaId, pedidoId, { nuevoTotal = null, ajusteMotivo = null }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const config = await obtenerConfig(tiendaId);
  const subtotal = Number(pedido.subtotal);
  const total = nuevoTotal ?? Number(pedido.total);
  const aPagar = montoACuenta(total, config);

  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "aceptar", {
      ahora,
      datosPedido: {
        total,
        descuentoMonto: Math.max(redondear(subtotal - total), 0),
        usuarioActualizacion: usuarioDe(user)
      },
      nota: nuevoTotal !== null ? `Aceptada con ajuste: ${ajusteMotivo}` : "Aceptada por el negocio"
    });
    await tx.reservas.update({
      where: { pedidoId },
      data: {
        respondidaEn: ahora,
        ajusteMonto: nuevoTotal !== null ? redondear(total - subtotal) : null,
        ajusteMotivo: nuevoTotal !== null ? ajusteMotivo : null,
        montoAPagar: aPagar,
        saldoDestino: redondear(total - aPagar)
      }
    });
  });

  await correoCliente(tiendaId, pedidoId, aceptadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** Rechazar con motivo visible para el cliente (R6.1). */
export async function rechazarReserva(tiendaId, pedidoId, { motivoTipo, motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const texto = motivo || MOTIVOS_RECHAZO[motivoTipo] || null;
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "rechazar", {
      ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: texto ? `Rechazada: ${texto}` : "Rechazada"
    });
    await tx.reservas.update({ where: { pedidoId }, data: { respondidaEn: ahora, motivoRechazo: texto } });
  });
  await correoCliente(tiendaId, pedidoId, rechazadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

const pagoPendiente = (pedido) => [...pedido.pagos].reverse()
  .find(p => p.proveedor === "manual" && p.estado === "pendiente");

/** "Pago verificado" (R7.3): confirma la reserva y registra lo pagado. */
export async function verificarPago(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const pago = pagoPendiente(pedido);
  if (!pago) throw new ConflictError("No hay un pago por verificar en esta reserva", { message: "No hay un pago por verificar en esta reserva", motivo: "SIN_PAGO_PENDIENTE" });

  const pagado = redondear(Number(pedido.montoPagado) + Number(pago.monto));
  await prisma.$transaction(async (tx) => {
    await tx.pagos.update({
      where: { id: pago.id },
      data: {
        estado: "pagado",
        metadata: { ...pago.metadata, verificadoPor: usuarioDe(user) },
        fechaActualizacion: ahora,
        usuarioActualizacion: usuarioDe(user)
      }
    });
    await aplicarAccion(tx, pedido, "verificar", {
      ahora,
      datosPedido: {
        montoPagado: pagado,
        estadoPago: pagado >= Number(pedido.total) ? "pagado" : "parcial",
        fechaConfirmado: ahora,
        usuarioActualizacion: usuarioDe(user)
      },
      nota: `Pago verificado · S/ ${Number(pago.monto).toFixed(2)} · ${pago.metodo}`
    });
  });

  await correoCliente(tiendaId, pedidoId, confirmadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** "No corresponde" (R7.3): la reserva vuelve a esperar el pago. */
export async function rechazarPago(tiendaId, pedidoId, { motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const pago = pagoPendiente(pedido);
  if (!pago) throw new ConflictError("No hay un pago por verificar en esta reserva", { message: "No hay un pago por verificar en esta reserva", motivo: "SIN_PAGO_PENDIENTE" });

  await prisma.$transaction(async (tx) => {
    await tx.pagos.update({
      where: { id: pago.id },
      data: {
        estado: "fallido",
        outcomeMensaje: motivo,
        metadata: { ...pago.metadata, motivo, revisadoPor: usuarioDe(user) },
        fechaActualizacion: ahora,
        usuarioActualizacion: usuarioDe(user)
      }
    });
    await aplicarAccion(tx, pedido, "rechazar_pago", {
      ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: `Pago no corresponde: ${motivo}`
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** El negocio cancela una reserva confirmada (R12.2). El reembolso se gestiona fuera. */
export async function cancelarPorNegocio(tiendaId, pedidoId, { motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  await prisma.$transaction(tx => aplicarAccion(tx, pedido, "cancelar_negocio", {
    ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: motivo ? `Cancelada por el negocio: ${motivo}` : "Cancelada por el negocio"
  }));
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** El cliente no llegó (R12.3): solo cuando ya pasó la hora de ingreso. */
export async function marcarNoShow(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (pedido.reserva.inicio > ahora) {
    throw new ConflictError("Solo se puede marcar después de la hora de ingreso", { message: "Solo se puede marcar después de la hora de ingreso", motivo: "AUN_NO_INICIA" });
  }
  await prisma.$transaction(tx => aplicarAccion(tx, pedido, "no_show", {
    ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: "El cliente no se presentó"
  }));
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Agenda "hoy y mañana" (R11.3): lo confirmado o por confirmar cuya estadía
 * toca el rango. No es un PMS: es una lista para imprimir o compartir.
 */
export async function agendaReservas(tiendaId, { desde, hasta } = {}, ahora = new Date()) {
  await persistirVencimientos(tiendaId);
  const dDesde = desde ?? fechaLima(ahora);
  const dHasta = hasta ?? sumarDias(dDesde, 1);
  const filas = await prisma.pedidos.findMany({
    where: {
      tiendaId,
      tipo: "hotel",
      estado: { in: ["aceptada", "pago_en_revision", "confirmada", "completada"] },
      reserva: {
        inicio: { lt: instanteLima(sumarDias(dHasta, 1)) },
        OR: [{ fin: { gte: instanteLima(dDesde) } }, { fin: null, inicio: { gte: instanteLima(dDesde) } }]
      }
    },
    orderBy: { fechaServicio: "asc" },
    include: { reserva: { include: INCLUDE_RESERVA.reserva.include }, pagos: true, detalles: true }
  });
  return { desde: dDesde, hasta: dHasta, reservas: filas.map(p => serializeReservaLista(p, ahora)) };
}
