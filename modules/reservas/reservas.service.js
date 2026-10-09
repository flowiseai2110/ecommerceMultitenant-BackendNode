import { prisma, Prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { generarNumeroPedido, upsertCliente } from "../ordenes/pedidos.service.js";
import { datosFactura } from "../sunat/ruc.service.js";
import { cotizarHotel, montoACuenta } from "./hotel/cotizar.js";
import { vozAlojamiento } from "./hotel/alojamiento.js";
import { ESTADOS_EN_CURSO, transicionar, estadoEfectivo } from "./estados.js";
import { obtenerConfig } from "./reservas.config.service.js";
import { cierresDeProducto } from "./cierres.service.js";
import { cargarHabitacionParaReserva } from "./hotel/habitaciones.service.js";
import { extrasDeTienda, planDeTienda, temporadasParaEstadia } from "./hotel/tarifas.service.js";
import { bloquearTipo, cupoEstadia } from "./hotel/disponibilidad.service.js";
import { cotizarTour } from "./tours/cotizar.js";
import { cargarTourParaReserva } from "./tours/tours.service.js";
import { cotizarEvento } from "./eventos/cotizar.js";
import { apartarEntradas, cargarFuncionParaCompra, moverVendidos } from "./eventos/eventos.service.js";
import { firmarTokenReserva } from "./reservas.token.js";
import { subirCaptura, urlCaptura } from "./reservas.capturas.js";
import { serializeReservaAdmin, serializeReservaLista, serializeReservaStore } from "./reservas.serializer.js";
import {
  aceptadaEmail, compraPendienteEmail, confirmadaEmail, nuevaReservaEmail, nuevaSolicitudEmail, pagoSubidoEmail, rechazadaEmail, solicitudRecibidaEmail
} from "./reservas.emails.js";
import { instanteLima, fechaLima, sumarDias } from "./tiempo.js";
import { errorNoDisponible, extraCotizacionLocal, filasCuotas, prepararAceptacion, verticalLocal } from "./locales/locales.service.js";
import { actualizarOcupacion, FechaNoDisponibleError, liberar, liberarHuerfanas, ocupar } from "./locales/ocupaciones.js";
import { conPreparacion } from "./locales/franja.js";

/**
 * Mini booking — reservas de hotel / hostal, de tours, compras de entradas
 * (docs/specs/mini-booking) y alquiler de locales (docs/specs/alquiler-locales).
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
          id: true, nombre: true, slug: true, traducciones: true,
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
  // Locales: plan de pagos (alquiler-locales R7).
  cuotas: { orderBy: { numero: "asc" } },
  cambios: { orderBy: { fechaRegistro: "asc" } },
  detalles: true,
  pagos: { orderBy: { fechaRegistro: "asc" } },
  historialEstados: { orderBy: { fechaRegistro: "asc" } }
};

/** Tipos de pedido que son reservas (comparten bandeja, pago y seguimiento). */
export const TIPOS_RESERVA = ["hotel", "tour", "evento", "local"];

const MOTIVOS_RECHAZO = {
  hotel: {
    sin_disponibilidad: "No hay disponibilidad para esa fecha",
    fecha_cerrada: "{Negocio} no recibe reservas esa fecha"
  },
  tour: {
    sin_disponibilidad: "No hay cupo en esa salida",
    fecha_cerrada: "No hay salida en esa fecha"
  }
};

const usuarioDe = (user) => user?.email ?? user?.id ?? null;

/** Locales: el pago va por cuotas (cuotas.service), no por el flujo de un solo pago. */
function exigirNoLocal(pedido) {
  if (pedido.tipo !== "local") return;
  const message = "Esta reserva se paga por cuotas: usa el plan de pagos";
  throw new ConflictError(message, { message, motivo: "USAR_CUOTAS" });
}

/** Estado efectivo de un pedido-reserva (con el apartado de eventos). */
export const efectivoDe = (pedido, ahora) => {
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
      // Al crear (trae titular): lo que solo se pide en la solicitud (hospedaje-completo B3, B6).
      if (datos.titular) {
        if (tipo.soloMujeres && !datos.confirmaSoloMujeres) {
          c.errores.push({ codigo: "SOLO_MUJERES", mensaje: "Esta habitación es solo para mujeres: confírmalo para enviar la solicitud", campo: "confirmaSoloMujeres" });
        }
        for (const x of c.extras) {
          if (x.datoPedido && !x.dato) c.errores.push({ codigo: "DATO_EXTRA", mensaje: `${x.nombre}: ${x.datoPedido}`, campo: "extras" });
        }
      }
      return {
        producto, c,
        detalle: {
          modalidadId: modalidad.id, noches: c.noches, horas: c.horas, adultos: datos.adultos, ninos: datos.ninos,
          edadesNinos: c.edadesNinos, exoneradoIgv: c.exoneradoIgv, habitaciones: c.habitaciones,
          ...(c.extras.length ? { extras: c.extras } : {}), ...(c.plan ? { plan: c.plan } : {})
        },
        // Para revalidar el cupo dentro de la transacción (C1).
        inventario: tipo.unidades != null && c.noches ? { productoId: producto.id, porPersona: tipo.porPersona, unidades: tipo.unidades, fecha: datos.fecha, noches: c.noches } : null,
        log: `${modalidad.tipo}, ingreso ${c.inicio.toISOString()}`
      };
    },
    /**
     * Con inventario, una reserva que nace aceptada (pago directo) o
     * confirmada aparta el cupo: se revalida con el tipo bloqueado para que
     * dos huéspedes no se lleven la última habitación (C1).
     */
    async enTransaccion(tx, { tiendaId, c, estadoInicial, ahora, inventario }) {
      if (!inventario || !["aceptada", "confirmada"].includes(estadoInicial)) return;
      await bloquearTipo(tx, inventario.productoId);
      const cupo = await cupoEstadia(tx, tiendaId, inventario, inventario.fecha, inventario.noches, { ahora });
      const pide = inventario.porPersona ? c.personasHotel : c.habitaciones;
      if (cupo && pide > cupo.libres) {
        const message = "Se acaba de ocupar el último cupo para esas fechas. Elige otras fechas.";
        throw new ConflictError(message, { message, motivo: "SIN_CUPO" });
      }
    }
  },
  tours: {
    tipoPedido: "tour",
    este: "esta agencia",
    async cotizar({ tiendaId, datos, config, ahora }) {
      const { producto, tour, tiposPasajero } = await cargarTourParaReserva(tiendaId, datos.productoId, datos.lang);
      const cierres = await cierresDeProducto(tiendaId, datos.productoId, datos.fecha, datos.fecha);
      const c = cotizarTour({
        tour, tiposPasajero, pasajeros: datos.pasajeros, fecha: datos.fecha, hora: datos.hora,
        idioma: datos.idioma, cierres, config, ahora, lang: datos.lang
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
  },
  // Locales: la franja del salón se ocupa en la transacción (restricción de exclusión).
  locales: verticalLocal
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
  // Habitación apartada con pago directo que no se pagó a tiempo (C1), o local
  // sin respuesta o sin pago al terminar su apartado (alquiler-locales R6.4).
  await prisma.$executeRaw`
    UPDATE pedidos p SET estado = 'vencida', fecha_actualizacion = now()
    FROM reservas r
    WHERE r.pedido_id = p.id AND p.tienda_id = ${tiendaId}::uuid
      AND p.estado IN ('solicitada', 'aceptada') AND r.apartado_hasta IS NOT NULL AND r.apartado_hasta <= now()`;
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
  await liberarHuerfanas(tiendaId);
}

export async function pedidoDeReserva(tiendaId, pedidoId, client = prisma) {
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
export async function aplicarAccion(tx, pedido, accion, { ahora = new Date(), datosPedido = {}, nota = null } = {}) {
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
export function enviar(destino, correo, replyTo) {
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
  // Locales: separación, garantía y si la franja está libre (R3.5, R4.1).
  if (vertical === verticalLocal) return { ...serializarCotizacion(c), ...await extraCotizacionLocal(datos.tiendaId, datos, c, ahora) };
  return serializarCotizacion(c);
}

async function cotizarHotelConCierres({ datos, tipo, modalidad, config, ahora }) {
  const desde = datos.fecha;
  const hasta = sumarDias(datos.fecha, Math.max(datos.noches ?? 1, 1));
  const [cierres, temporadas, extrasCatalogo, cupo, plan] = await Promise.all([
    cierresDeProducto(datos.tiendaId, datos.productoId, desde, hasta),
    modalidad.tipo === "noche" ? temporadasParaEstadia(datos.tiendaId, datos.productoId, desde, hasta, datos.lang) : [],
    datos.extras?.length ? extrasDeTienda(datos.tiendaId, datos.lang) : [],
    modalidad.tipo === "noche" && datos.noches
      ? cupoEstadia(prisma, datos.tiendaId, { productoId: datos.productoId, porPersona: tipo.porPersona, unidades: tipo.unidades }, datos.fecha, datos.noches, { ahora })
      : null,
    datos.planId ? planDeTienda(datos.tiendaId, datos.planId, datos.lang) : null
  ]);
  const cotizacion = cotizarHotel({
    tipo, modalidad, fecha: datos.fecha, hora: datos.hora, noches: datos.noches,
    adultos: datos.adultos, ninos: datos.ninos, cierres, config, ahora,
    temporadas, extrasCatalogo, extrasElegidos: datos.extras ?? [], edadesNinos: datos.edadesNinos ?? [],
    nacionalidad: datos.titular?.nacionalidad ?? datos.nacionalidad ?? null,
    habitaciones: datos.habitaciones ?? 1, cupo, plan,
    // El huésped que reserva en inglés ve las líneas y los errores en inglés (C3).
    idioma: datos.lang
  });
  if (datos.planId && !plan) cotizacion.errores.push({ codigo: "PLAN_INVALIDO", mensaje: "Esa tarifa ya no está disponible", campo: "planId" });
  cotizacion.personasHotel = (datos.adultos ?? 0) + (datos.ninos ?? 0);
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
  total: c.total, montoAPagar: c.montoAPagar, saldoDestino: c.saldoDestino, aviso: c.aviso, errores: c.errores,
  // Hotel (hospedaje-completo B5): IGV exonerado o cuánto pagaría un extranjero.
  exoneradoIgv: c.exoneradoIgv ?? false, totalExtranjero: c.totalExtranjero ?? null,
  // Fase C: habitaciones, plan y cupo ("Quedan 2").
  habitaciones: c.habitaciones ?? 1, plan: c.plan ?? null, quedan: c.quedan ?? null,
  // Extras elegidos con el dato que hay que pedirle al huésped (B3).
  extras: (c.extras ?? []).map(x => ({ id: x.id, nombre: x.nombre, cantidad: x.cantidad, total: x.total, datoPedido: x.datoPedido }))
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
  const cotizado = await vertical.cotizar({ tiendaId: tienda.id, datos, config, ahora });
  const { producto, c, detalle, log, inventario = null } = cotizado;
  if (c.errores.length) {
    throw new ValidationError(c.errores[0].mensaje, { motivo: "RESERVA_NO_VALIDA", errores: c.errores });
  }

  const whatsapp = datos.whatsapp.replace(/[\s-]/g, "");
  const docNumero = datos.titular.docNumero.toUpperCase();
  await validarSolicitudesAbiertas(tienda.id, vertical, { whatsapp, docNumero }, config.maxSolicitudesAbiertas, ahora);

  // Pago directo sin nada que pagar por adelantado (cobro en destino): la
  // reserva nace confirmada; se paga al llegar (hospedaje-completo A6).
  const estadoInicial = vertical.estadoInicial?.(c)
    ?? (config.modoConfirmacion === "pago_directo" ? (c.montoAPagar > 0 ? "aceptada" : "confirmada") : "solicitada");
  // Hotel con inventario y pago directo: la habitación queda apartada mientras
  // paga; si no sube la captura a tiempo, la reserva se anula y el cupo vuelve (C1).
  if (inventario && estadoInicial === "aceptada") detalle.apartadoHasta = nuevoApartado(c.inicio, config, ahora);
  // Locales: la solicitud aparta la fecha durante el plazo de respuesta (R6.4).
  if (vertical.apartadoInicial) detalle.apartadoHasta = vertical.apartadoInicial(estadoInicial, c, config, ahora);
  // Idioma en que reservó el huésped: los correos le llegan en ese idioma (C3).
  detalle.idiomaHuesped = datos.lang === "en" ? "en" : "es";
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
          // Una reserva confirmada sin cobrar (se paga al llegar) sigue pendiente de pago.
          estadoPago: estadoInicial === "confirmada" && c.total === 0 ? "pagado" : "pendiente",
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
                varianteNombre: l.descripcion.slice(0, 100),
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
                // Hotel o tour con cobro en destino y confirmación inmediata; o entradas libres.
                ...(vertical.tipoPedido !== "evento" ? { confirmada: "Reserva confirmada desde la vitrina: se paga al llegar" } : {}),
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
      await vertical.enTransaccion?.(tx, {
        tiendaId: tienda.id, pedidoId: creado.id, c, estadoInicial, ahora, inventario, cotizado, config, apartadoHasta: detalle.apartadoHasta ?? null
      });
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
    // Locales: la franja se ocupó entre la cotización y el envío → 409 con alternativas (R3.4).
    if (vertical.traducirError) throw await vertical.traducirError(error, { tiendaId: tienda.id, datos, cotizado, ahora });
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
  // Con confirmación inmediata (pago directo) no hay solicitud que responder:
  // la reserva nace aceptada (por pagar) o confirmada (se paga al llegar).
  const dtoNegocio = serializeReservaAdmin(pedido);
  const alCliente = { solicitada: solicitudRecibidaEmail, aceptada: aceptadaEmail, confirmada: confirmadaEmail }[pedido.estado] ?? solicitudRecibidaEmail;
  enviar(pedido.clienteEmail, alCliente(dtoCliente, urlSeguimiento(tienda.slug, token)), tienda.email);
  enviar(tienda.email, (pedido.estado === "solicitada" ? nuevaSolicitudEmail : nuevaReservaEmail)(dtoNegocio), pedido.clienteEmail);
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
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "cancelar_cliente", { ahora, nota: "Cancelada por el cliente" });
    if (pedido.tipo === "local") await liberar(tx, pedidoId);
  });
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

/**
 * El cliente sube la captura del pago manual (R7.2). Se puede volver a subir
 * mientras está en revisión (por ejemplo, si se equivocó de imagen).
 */
export async function subirCapturaCliente(tiendaId, pedidoId, { file, metodo, numeroOperacion }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirNoLocal(pedido);
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

/** Sin plazo, o con el plazo (apartado de locales o habitación) todavía vigente. */
const apartadoVigente = (ahora) => ({ OR: [{ apartadoHasta: null }, { apartadoHasta: { gt: ahora } }] });
const cuotaEnRevision = { tipo: "local", cuotas: { some: { estado: "en_revision" } } };

function wherePestana(pestana, ahora) {
  switch (pestana) {
    case "por_responder": return { estado: "solicitada", reserva: { inicio: { gt: ahora }, ...apartadoVigente(ahora) } };
    // Locales: también las cuotas siguientes en revisión de una reserva ya confirmada.
    case "pago_por_verificar": return { OR: [{ estado: "pago_en_revision" }, cuotaEnRevision] };
    // Locales (alquiler-locales R12.1): mora y garantías por devolver.
    case "cuotas_vencidas": return {
      tipo: "local", estado: { in: ["confirmada", "pago_en_revision"] }, reserva: { fin: { gt: ahora } },
      cuotas: { some: { estado: "pendiente", venceEn: { lt: new Date(`${fechaLima(ahora)}T00:00:00Z`) } } }
    };
    // Hasta la liquidación (fase 2): eventos pasados con garantía cobrada.
    case "garantias": return {
      tipo: "local", estado: { in: ["confirmada", "completada"] }, reserva: { fin: { lte: ahora } },
      cuotas: { some: { concepto: "garantia", estado: "pagada" } }
    };
    // Próximas: aceptadas o compras esperando pago, y confirmadas que aún no terminan.
    case "confirmadas": return {
      OR: [
        { estado: "aceptada", reserva: { inicio: { gt: ahora }, ...apartadoVigente(ahora) } },
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
      include: { reserva: { include: INCLUDE_RESERVA.reserva.include }, pagos: true, detalles: true, cuotas: INCLUDE_RESERVA.cuotas }
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
  const [porResponder, pagoPorVerificar, cuotasVencidas] = await Promise.all([
    prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_RESERVA }, ...wherePestana("por_responder", ahora) } }),
    prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_RESERVA }, ...wherePestana("pago_por_verificar", ahora) } }),
    prisma.pedidos.count({ where: { tiendaId, ...wherePestana("cuotas_vencidas", ahora) } })
  ]);
  // La mora no suma al badge: es un indicador, no una acción pendiente (R7.7).
  return { porResponder, pagoPorVerificar, cuotasVencidas, total: porResponder + pagoPorVerificar };
}

/** Detalle para el negocio, con la URL firmada de cada captura. */
export async function detalleReservaAdmin(tiendaId, pedidoId, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const urlsCaptura = new Map(await Promise.all(
    pedido.pagos.filter(p => p.metadata?.capturaPath).map(async p => [p.id, await urlCaptura(p.metadata.capturaPath)])
  ));
  return serializeReservaAdmin(pedido, { urlsCaptura, ahora });
}

export async function correoCliente(tiendaId, pedidoId, plantilla) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  const [pedido, config] = await Promise.all([pedidoDeReserva(tiendaId, pedidoId), obtenerConfig(tiendaId)]);
  const token = await firmarTokenReserva({ pedidoId, tiendaId });
  const dto = serializeReservaStore(pedido, { tienda, config });
  enviar(pedido.clienteEmail, plantilla(dto, urlSeguimiento(tienda.slug, token)), tienda.email);
}

/** Correo al cliente según el estado actual de la reserva. */
const CORREO_POR_ESTADO = {
  solicitada: solicitudRecibidaEmail, aceptada: aceptadaEmail, por_pagar: compraPendienteEmail,
  pago_en_revision: solicitudRecibidaEmail, confirmada: confirmadaEmail, completada: confirmadaEmail, rechazada: rechazadaEmail
};

/**
 * Reenvía al cliente el correo de su estado actual (alquiler-locales CE-13,
 * vale para todas las verticales): el seguimiento es la fuente de verdad y el
 * correo, una copia que se puede volver a mandar.
 */
export async function reenviarCorreo(tiendaId, pedidoId, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const plantilla = CORREO_POR_ESTADO[efectivoDe(pedido, ahora)];
  if (!plantilla || !pedido.clienteEmail) {
    const message = !pedido.clienteEmail ? "La reserva no tiene correo del cliente" : "No hay un correo que reenviar en este estado";
    throw new ConflictError(message, { message, motivo: "SIN_CORREO" });
  }
  await correoCliente(tiendaId, pedidoId, plantilla);
  return { enviadoA: pedido.clienteEmail };
}

/** Aceptar (R6.1, R6.2), con ajuste opcional del total (R6.4). */
export async function aceptarReserva(tiendaId, pedidoId, { nuevoTotal = null, ajusteMotivo = null, forzar = false }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (pedido.tipo === "local") return aceptarLocal(tiendaId, pedido, { nuevoTotal, ajusteMotivo }, user, ahora);
  const config = await obtenerConfig(tiendaId);
  if (pedido.tipo === "hotel" && !forzar) await validarCupoAlAceptar(tiendaId, pedido, ahora);
  const subtotal = Number(pedido.subtotal);
  const total = nuevoTotal ?? Number(pedido.total);
  const aPagar = montoACuenta(total, config);
  // Sin adelanto (cobro en destino) no hay pago que esperar: aceptar confirma.
  const sinPago = aPagar === 0;

  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, sinPago ? "confirmar_sin_pago" : "aceptar", {
      ahora,
      datosPedido: {
        total,
        descuentoMonto: Math.max(redondear(subtotal - total), 0),
        usuarioActualizacion: usuarioDe(user),
        ...(sinPago ? { fechaConfirmado: ahora } : {})
      },
      nota: (nuevoTotal !== null ? `Aceptada con ajuste: ${ajusteMotivo}` : "Aceptada por el negocio") + (sinPago ? " (se paga al llegar)" : "")
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

  await correoCliente(tiendaId, pedidoId, sinPago ? confirmadaEmail : aceptadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Locales (alquiler-locales R6.3, R6.5): aceptar genera el plan de pagos y el
 * contrato, y la solicitud pasa a apartado con su propio plazo. Si la fila de
 * ocupación ya no está (limpiada al vencer), se vuelve a ocupar: la BD decide.
 */
async function aceptarLocal(tiendaId, pedido, { nuevoTotal, ajusteMotivo }, user, ahora) {
  const config = await obtenerConfig(tiendaId);
  const subtotal = Number(pedido.subtotal);
  const anterior = Number(pedido.total);
  const total = nuevoTotal ?? anterior;
  const { separacion, cuotas, contrato, apartadoHasta } = await prepararAceptacion(prisma, { pedido, config, total, ahora });
  const r = pedido.reserva;

  try {
    await prisma.$transaction(async (tx) => {
      await aplicarAccion(tx, pedido, "aceptar", {
        ahora,
        datosPedido: { total, descuentoMonto: Math.max(redondear(subtotal - total), 0), usuarioActualizacion: usuarioDe(user) },
        nota: nuevoTotal !== null ? `Aceptada con ajuste: ${ajusteMotivo}` : "Aceptada por el negocio"
      });
      await tx.reservas.update({
        where: { pedidoId: pedido.id },
        data: {
          respondidaEn: ahora,
          ...(nuevoTotal !== null ? { ajusteMonto: redondear(total - subtotal), ajusteMotivo } : {}),
          montoAPagar: separacion, saldoDestino: 0, apartadoHasta, contrato
        }
      });
      await tx.reserva_cuotas.deleteMany({ where: { pedidoId: pedido.id, tiendaId } });
      await tx.reserva_cuotas.createMany({ data: filasCuotas(cuotas, { tiendaId, pedidoId: pedido.id, usuario: usuarioDe(user) }) });
      const { count } = await actualizarOcupacion(tx, pedido.id, { tipo: "apartado", expiraEn: apartadoHasta });
      if (count === 0) {
        const f = conPreparacion(r.inicio, r.fin, r.local?.salon?.preparacionMin ?? 0);
        await ocupar(tx, { tiendaId, pedidoId: pedido.id, productoId: r.productoId, tipo: "apartado", inicio: f.ocupaInicio, fin: f.ocupaFin, expiraEn: apartadoHasta, usuario: usuarioDe(user) });
      }
      if (nuevoTotal !== null && total !== anterior) {
        await tx.reserva_cambios.create({
          data: {
            tiendaId, pedidoId: pedido.id, tipo: "ajuste_monto", actor: "negocio", antes: { total: anterior }, despues: { total },
            nota: ajusteMotivo, diferencia: redondear(total - anterior), usuarioRegistro: usuarioDe(user)
          }
        });
      }
    });
  } catch (error) {
    if (error instanceof FechaNoDisponibleError) throw errorNoDisponible([]);
    throw error;
  }

  await correoCliente(tiendaId, pedido.id, aceptadaEmail);
  return detalleReservaAdmin(tiendaId, pedido.id, ahora);
}

/**
 * Con inventario (C1): aceptar sin cupo responde 409 SIN_CUPO con el detalle
 * de la noche llena; el admin puede confirmar y reenviar con `forzar` (sabe
 * algo que el sistema no: una cancelación por teléfono, una habitación extra).
 */
async function validarCupoAlAceptar(tiendaId, pedido, ahora) {
  const r = pedido.reserva;
  if (!r.noches) return;
  const tipo = await prisma.hotel_tipos_habitacion.findUnique({
    where: { productoId: r.productoId }, select: { productoId: true, porPersona: true, unidades: true }
  });
  if (tipo?.unidades == null) return;
  const cupo = await cupoEstadia(prisma, tiendaId, tipo, fechaLima(r.inicio), r.noches, { ahora, excluirPedidoId: pedido.id });
  const pide = tipo.porPersona ? (r.adultos ?? 0) + (r.ninos ?? 0) : (r.habitaciones ?? 1);
  if (cupo && pide > cupo.libres) {
    const unidad = tipo.porPersona ? "camas" : "habitaciones";
    const message = `No hay cupo: para esas noches te quedan ${cupo.libres} de ${cupo.unidades} ${unidad} y esta reserva pide ${pide}.`;
    throw new ConflictError(message, { message, motivo: "SIN_CUPO", libres: cupo.libres, unidades: cupo.unidades, pide });
  }
}

/** Rechazar con motivo visible para el cliente (R6.1). */
export async function rechazarReserva(tiendaId, pedidoId, { motivoTipo, motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const predefinido = (MOTIVOS_RECHAZO[pedido.tipo] ?? MOTIVOS_RECHAZO.hotel)[motivoTipo];
  const negocio = predefinido?.includes("{Negocio}") ? vozAlojamiento((await obtenerConfig(tiendaId)).tipoAlojamiento).Negocio : null;
  const texto = motivo || (negocio ? predefinido.replace("{Negocio}", negocio) : predefinido) || null;
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "rechazar", {
      ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: texto ? `Rechazada: ${texto}` : "Rechazada"
    });
    await tx.reservas.update({ where: { pedidoId }, data: { respondidaEn: ahora, motivoRechazo: texto } });
    if (pedido.tipo === "local") await liberar(tx, pedidoId);
  });
  await correoCliente(tiendaId, pedidoId, rechazadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

const pagoPendiente = (pedido) => [...pedido.pagos].reverse()
  .find(p => p.proveedor === "manual" && p.estado === "pendiente");

/** "Pago verificado" (R7.3): confirma la reserva y registra lo pagado. */
export async function verificarPago(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirNoLocal(pedido);
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
  exigirNoLocal(pedido);
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
    // Entradas, o una habitación apartada (C1): vuelve a esperar el pago con
    // un apartado nuevo para que suba otra captura.
    if (pedido.tipo === "evento" || pedido.reserva.apartadoHasta) {
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
    // Locales: la franja se libera en la misma transacción (R10.6). La devolución llega en la fase 2.
    if (pedido.tipo === "local") await liberar(tx, pedidoId);
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
    include: { reserva: { include: INCLUDE_RESERVA.reserva.include }, pagos: true, detalles: true, cuotas: INCLUDE_RESERVA.cuotas }
  });
  return { desde: dDesde, hasta: dHasta, reservas: filas.map(p => serializeReservaLista(p, ahora)) };
}
