import { prisma, Prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { generarNumeroPedido, upsertCliente } from "../ordenes/pedidos.service.js";
import { datosFactura } from "../sunat/ruc.service.js";
import { cotizarHotel, montoACuenta } from "./hotel/cotizar.js";
import { ESTADOS_EN_CURSO, transicionar, estadoEfectivo } from "./estados.js";
import { obtenerConfig } from "./reservas.config.service.js";
import { cierresDeProducto } from "./cierres.service.js";
import { cargarHabitacionParaReserva } from "./hotel/habitaciones.service.js";
import { cotizarTour } from "./tours/cotizar.js";
import { cargarTourParaReserva } from "./tours/tours.service.js";
import { cotizarEvento } from "./eventos/cotizar.js";
import { apartarEntradas, cargarFuncionParaCompra, moverVendidos } from "./eventos/eventos.service.js";
import { firmarTokenReserva } from "./reservas.token.js";
import { subirCaptura, urlCaptura } from "./reservas.capturas.js";
import { serializeReservaAdmin, serializeReservaLista, serializeReservaStore } from "./reservas.serializer.js";
import {
  aceptadaEmail, compraPendienteEmail, confirmadaEmail, nuevaSolicitudEmail, pagoSubidoEmail, rechazadaEmail, solicitudRecibidaEmail
} from "./reservas.emails.js";
import { instanteLima, fechaLima, sumarDias } from "./tiempo.js";

/**
 * Mini booking — reservas de hotel / hostal, de tours y compras de entradas
 * (docs/specs/mini-booking).
 *
 * Una reserva es un `pedidos` (tipo = hotel | tour | evento: dinero, cliente,
 * comprobante, número) + una fila en `reservas` (estadía, salida o función, y
 * titular). En hotel y tours no hay inventario: el negocio acepta o rechaza.
 * En eventos el cupo es real: la compra aparta entradas mientras se paga. Lo
 * no atendido o no pagado a tiempo se anula y lo confirmado pasa a completado
 * al terminar; ambas cosas se calculan al leer.
 *
 * La bandeja, los estados, el pago y los correos son comunes; cada vertical
 * aporta su cotización (VERTICALES).
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
          imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
          tour: { select: { duracion: true, puntoEncuentro: true, recojo: true } },
          evento: { select: { lugar: true, direccion: true, mapaUrl: true, organizador: true } }
        }
      },
      modalidad: true,
      funcion: { select: { id: true, nombre: true, inicio: true, fin: true } }
    }
  },
  itemsEvento: true,
  detalles: true,
  pagos: { orderBy: { fechaRegistro: "asc" } },
  historialEstados: { orderBy: { fechaRegistro: "asc" } }
};

/** Tipos de pedido que son reservas (comparten bandeja, pago y seguimiento). */
export const TIPOS_RESERVA = ["hotel", "tour", "evento"];

const MOTIVOS_RECHAZO = {
  hotel: {
    sin_disponibilidad: "No hay disponibilidad para esa fecha",
    fecha_cerrada: "El hotel no recibe reservas esa fecha"
  },
  tour: {
    sin_disponibilidad: "No hay cupo en esa salida",
    fecha_cerrada: "No hay salida en esa fecha"
  }
};

const usuarioDe = (user) => user?.email ?? user?.id ?? null;

/** Estado efectivo de un pedido-reserva (con el apartado de eventos). */
const efectivoDe = (pedido, ahora) => {
  const r = pedido.reserva;
  return estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin, apartadoHasta: r.apartadoHasta }, ahora);
};

/** Hasta cuándo queda apartado el cupo de una compra (nunca después de la función). */
const nuevoApartado = (inicio, config, ahora) => {
  const limite = new Date(ahora.getTime() + config.apartadoManualMin * 60 * 1000);
  return limite < inicio ? limite : inicio;
};
const redondear = (n) => Math.round(n * 100) / 100;

/**
 * Cotización por vertical (Strategy): carga el producto, aplica sus reglas y
 * devuelve lo que la reserva guarda como detalle.
 *   → { producto, c (cotización), detalle (columnas propias de `reservas`), log }
 */
const VERTICALES = {
  hotel: {
    tipoPedido: "hotel",
    este: "este hotel",
    async cotizar({ tiendaId, datos, config, ahora }) {
      if (!datos.modalidadId) {
        throw new ValidationError("Elige una modalidad de estadía", { message: "Elige una modalidad de estadía", motivo: "MODALIDAD_INVALIDA" });
      }
      const { producto, tipo, modalidad } = await cargarHabitacionParaReserva(tiendaId, datos.productoId, datos.modalidadId);
      const c = await cotizarHotelConCierres({ datos, tipo, modalidad, config, ahora });
      return {
        producto, c,
        detalle: { modalidadId: modalidad.id, noches: c.noches, horas: c.horas, adultos: datos.adultos, ninos: datos.ninos },
        log: `${modalidad.tipo}, ingreso ${c.inicio.toISOString()}`
      };
    }
  },
  tours: {
    tipoPedido: "tour",
    este: "esta agencia",
    async cotizar({ tiendaId, datos, config, ahora }) {
      const { producto, tour, tiposPasajero } = await cargarTourParaReserva(tiendaId, datos.productoId);
      const cierres = await cierresDeProducto(tiendaId, datos.productoId, datos.fecha, datos.fecha);
      const c = cotizarTour({
        tour, tiposPasajero, pasajeros: datos.pasajeros, fecha: datos.fecha, hora: datos.hora,
        idioma: datos.idioma, cierres, config, ahora
      });
      return {
        producto, c,
        detalle: { pasajeros: c.pasajeros, idioma: c.idioma },
        log: `${c.personas} pax, salida ${c.inicio.toISOString()}`
      };
    }
  },
  eventos: {
    tipoPedido: "evento",
    este: "este evento",
    async cotizar({ tiendaId, datos, config, ahora }) {
      const { producto, funcion, tipos, apartadas } = await cargarFuncionParaCompra(tiendaId, datos.productoId, datos.funcionId, ahora);
      const c = cotizarEvento({ funcion, tipos, apartadas, entradas: datos.entradas, config, ahora });
      return {
        producto, c,
        detalle: { funcionId: funcion.id, apartadoHasta: c.total > 0 ? c.apartadoHasta : null },
        log: `${c.personas} entradas, función ${c.inicio.toISOString()}`
      };
    },
    // Sin solicitud: la compra aparta el cupo y espera el pago. Gratis = confirmada en el acto.
    estadoInicial: (c) => (c.total > 0 ? "por_pagar" : "confirmada"),
    // Cuentan las compras que retienen cupo (anti-acaparamiento).
    whereAbiertas: (ahora) => ({
      OR: [{ estado: "pago_en_revision" }, { estado: "por_pagar", reserva: { apartadoHasta: { gt: ahora }, inicio: { gt: ahora } } }]
    }),
    /** Dentro de la transacción: bloquea los tipos, revalida el cupo y registra las entradas. */
    enTransaccion: (tx, { tiendaId, pedidoId, c, estadoInicial, ahora }) =>
      apartarEntradas(tx, { tiendaId, pedidoId, items: c.items, confirmar: estadoInicial === "confirmada", ahora })
  }
};

async function tiendaDeReservas(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  if (!tienda || !tienda.activo) throw new NotFoundError("Tienda");
  const vertical = VERTICALES[tienda.tipoNegocio];
  if (!vertical) {
    throw new ValidationError("Esta tienda no recibe reservas", { message: "Esta tienda no recibe reservas", motivo: "TIENDA_SIN_RESERVAS" });
  }
  return { tienda, vertical };
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
  // Compras de entradas sin captura: el apartado terminó y el cupo vuelve a la venta.
  await prisma.$executeRaw`
    UPDATE pedidos p SET estado = 'vencida', fecha_actualizacion = now()
    FROM reservas r
    WHERE r.pedido_id = p.id AND p.tienda_id = ${tiendaId}::uuid
      AND p.estado = 'por_pagar' AND (r.inicio <= now() OR r.apartado_hasta <= now())`;
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
  const nuevo = transicionar(efectivoDe(pedido, ahora), accion, pedido.tipo);
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
  const { vertical } = await tiendaDeReservas(datos.tiendaId);
  const config = await obtenerConfig(datos.tiendaId);
  const { c } = await vertical.cotizar({ tiendaId: datos.tiendaId, datos, config, ahora });
  return serializarCotizacion(c);
}

async function cotizarHotelConCierres({ datos, tipo, modalidad, config, ahora }) {
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
  inicio: c.inicio, fin: c.fin, noches: c.noches, horas: c.horas, personas: c.personas ?? null, lineas: c.lineas,
  total: c.total, montoAPagar: c.montoAPagar, saldoDestino: c.saldoDestino, aviso: c.aviso, errores: c.errores
});

/** Máximo de solicitudes en curso por cliente (por WhatsApp o documento), spec R5.7. */
async function validarSolicitudesAbiertas(tiendaId, vertical, { whatsapp, docNumero }, max, ahora) {
  const enCurso = vertical.whereAbiertas
    ? vertical.whereAbiertas(ahora)
    : { estado: { in: ESTADOS_EN_CURSO }, reserva: { inicio: { gt: ahora } } };
  const abiertas = await prisma.pedidos.count({
    where: {
      AND: [
        { tiendaId, tipo: vertical.tipoPedido },
        enCurso,
        { OR: [{ clienteWhatsapp: whatsapp }, { reserva: { titularDocNumero: docNumero } }] }
      ]
    }
  });
  if (abiertas >= max) {
    const message = vertical.tipoPedido === "evento"
      ? `Ya tienes ${abiertas} compras pendientes de pago en ${vertical.este}. Completa o cancela alguna antes de hacer otra.`
      : `Ya tienes ${abiertas} solicitudes en curso en ${vertical.este}. Espera la respuesta o cancela alguna.`;
    throw new ValidationError(message, { message,
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
  const { tienda, vertical } = await tiendaDeReservas(datos.tiendaId);

  const existente = await prisma.pedidos.findFirst({
    where: { tiendaId: tienda.id, idempotencyKey: datos.idempotencyKey },
    select: { id: true }
  });
  if (existente) return resultadoSolicitud(tienda, existente.id, false);

  const config = await obtenerConfig(tienda.id);
  const { producto, c, detalle, log } = await vertical.cotizar({ tiendaId: tienda.id, datos, config, ahora });
  if (c.errores.length) {
    throw new ValidationError(c.errores[0].mensaje, { motivo: "RESERVA_NO_VALIDA", errores: c.errores });
  }

  const whatsapp = datos.whatsapp.replace(/[\s-]/g, "");
  const docNumero = datos.titular.docNumero.toUpperCase();
  await validarSolicitudesAbiertas(tienda.id, vertical, { whatsapp, docNumero }, config.maxSolicitudesAbiertas, ahora);

  const estadoInicial = vertical.estadoInicial?.(c) ?? (config.modoConfirmacion === "pago_directo" ? "aceptada" : "solicitada");
  // Fuera de la transacción: es una consulta de red (ver pedidos.service).
  const factura = datos.factura ? await datosFactura(datos.factura.ruc) : null;
  const nombreCompleto = `${datos.titular.nombres} ${datos.titular.apellidos}`;

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const numeroPedido = await generarNumeroPedido(tienda.id, tx);
      const cliente = await upsertCliente(tienda.id, {
        whatsappNumero: whatsapp, nombre: nombreCompleto, email: datos.email,
        tipoDocumento: datos.titular.docTipo, numeroDocumento: docNumero
      }, tx);

      const creado = await tx.pedidos.create({
        data: {
          tiendaId: tienda.id,
          clienteId: cliente.id,
          clienteNombre: nombreCompleto,
          clienteWhatsapp: whatsapp,
          clienteEmail: datos.email,
          authUserId,
          numeroPedido,
          tipo: vertical.tipoPedido,
          estado: estadoInicial,
          // Solo una entrada libre nace confirmada (y pagada: no hay nada que cobrar).
          estadoPago: estadoInicial === "confirmada" ? "pagado" : "pendiente",
          fechaConfirmado: estadoInicial === "confirmada" ? ahora : null,
          fechaServicio: c.inicio,
          subtotal: c.total,
          total: c.total,
          notas: datos.comentarios,
          origen: "web",
          idempotencyKey: datos.idempotencyKey,
          // Solo la intención: el negocio emite el comprobante con su sistema (R14.3).
          comprobante: datos.factura ? "factura" : null,
          comprobanteDocTipo: datos.factura ? "RUC" : null,
          comprobanteDocNumero: datos.factura?.ruc ?? null,
          razonSocial: factura?.razonSocial ?? null,
          direccionFiscal: factura?.direccionFiscal ?? null,
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
              notas: {
                solicitada: "Solicitud enviada desde la vitrina",
                aceptada: "Reserva con pago directo desde la vitrina",
                por_pagar: "Compra de entradas: cupo apartado hasta recibir el pago",
                confirmada: "Entradas libres confirmadas desde la vitrina"
              }[estadoInicial]
            }
          },
          reserva: {
            create: {
              tiendaId: tienda.id,
              tipo: vertical.tipoPedido,
              productoId: producto.id,
              ...detalle,
              inicio: c.inicio,
              fin: c.fin,
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
      await vertical.enTransaccion?.(tx, { tiendaId: tienda.id, pedidoId: creado.id, c, estadoInicial, ahora });
      return creado;
    }, { maxWait: 5000, timeout: 15000 });

    logger.info(`🛎️ Reservas: solicitud en ${tienda.slug} (${log})`);
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
  // Compra de entradas: el organizador no tiene nada que responder; se le avisa al subir la captura.
  if (pedido.tipo === "evento") {
    const correo = pedido.estado === "confirmada" ? confirmadaEmail : compraPendienteEmail;
    enviar(pedido.clienteEmail, correo(dtoCliente, urlSeguimiento(tienda.slug, token)), tienda.email);
    return;
  }
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
  transicionar(efectivoDe(pedido, ahora), "subir_captura", pedido.tipo);

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
    // Próximas: aceptadas o compras esperando pago, y confirmadas que aún no terminan.
    case "confirmadas": return {
      OR: [
        { estado: "aceptada", reserva: { inicio: { gt: ahora } } },
        { estado: "por_pagar", reserva: { inicio: { gt: ahora }, apartadoHasta: { gt: ahora } } },
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

  const and = [{ tiendaId, tipo: { in: TIPOS_RESERVA } }, wherePestana(pestana, ahora)];
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
    prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_RESERVA }, estado: "solicitada", reserva: { inicio: { gt: ahora } } } }),
    prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_RESERVA }, estado: "pago_en_revision" } })
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
  const texto = motivo || (MOTIVOS_RECHAZO[pedido.tipo] ?? MOTIVOS_RECHAZO.hotel)[motivoTipo] || null;
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
    // Entradas: el cupo apartado pasa a vendido (filas bloqueadas; el CHECK impide sobrevender).
    if (pedido.tipo === "evento") await moverVendidos(tx, tiendaId, pedidoId, +1);
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
    // Entradas: vuelve a "por pagar" con un apartado nuevo para que suba otra captura.
    if (pedido.tipo === "evento") {
      const config = await obtenerConfig(tiendaId);
      await tx.reservas.update({ where: { pedidoId }, data: { apartadoHasta: nuevoApartado(pedido.reserva.inicio, config, ahora) } });
    }
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** El negocio cancela una reserva confirmada (R12.2). El reembolso se gestiona fuera. */
export async function cancelarPorNegocio(tiendaId, pedidoId, { motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  // Entradas ya vendidas vuelven a la venta; las apartadas se liberan solas con el cambio de estado.
  const devolverCupo = pedido.tipo === "evento" && efectivoDe(pedido, ahora) === "confirmada";
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "cancelar_negocio", {
      ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: motivo ? `Cancelada por el negocio: ${motivo}` : "Cancelada por el negocio"
    });
    if (devolverCupo) await moverVendidos(tx, tiendaId, pedidoId, -1);
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** El cliente no llegó (R12.3): solo cuando ya pasó la hora de inicio (ingreso o salida del tour). */
export async function marcarNoShow(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (pedido.reserva.inicio > ahora) {
    throw new ConflictError("Solo se puede marcar después de la hora de inicio", { message: "Solo se puede marcar después de la hora de inicio", motivo: "AUN_NO_INICIA" });
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
      tipo: { in: TIPOS_RESERVA },
      estado: { in: ["aceptada", "por_pagar", "pago_en_revision", "confirmada", "completada"] },
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
