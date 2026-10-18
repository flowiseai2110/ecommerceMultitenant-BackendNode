import { prisma, Prisma } from "../../config/prisma.js";
import { IDIOMA_BASE } from "../idiomas/idioma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { generarNumeroPedido, upsertCliente } from "../ordenes/pedidos.service.js";
import { datosFactura } from "../sunat/ruc.service.js";
import { montoACuenta } from "./hotel/cotizar.js";
import { vozAlojamiento } from "./hotel/alojamiento.js";
import { ESTADOS_EN_CURSO, TIPOS_CON_CICLO, transicionar, estadoEfectivo } from "./estados.js";
import { obtenerConfig } from "./reservas.config.service.js";
import { aplicarFormulario, formularioDe } from "./formulario.js";
import { firmarTokenReserva } from "./reservas.token.js";
import { subirCaptura, urlCaptura } from "./reservas.capturas.js";
import { serializeReservaAdmin, serializeReservaLista, serializeReservaStore } from "./reservas.serializer.js";
import {
  aceptadaEmail, compraPendienteEmail, confirmadaEmail, nuevaReservaEmail, nuevaSolicitudEmail, pagoSubidoEmail, rechazadaEmail, solicitudRecibidaEmail
} from "./reservas.emails.js";
import { instanteLima, fechaLima, sumarDias } from "./tiempo.js";
import { estrategiaDe, rubroDePedido, verticalDePedido } from "../negocio/registro.js";
import { exigirManual, modoEfectivo } from "../pagos/modo-pago.service.js";
import { errorNoDisponible, filasCuotas, prepararAceptacion } from "./locales/locales.service.js";
import { actualizarOcupacion, FechaNoDisponibleError, liberarHuerfanas, ocupar } from "./locales/ocupaciones.js";
import { conPreparacion } from "./locales/franja.js";
import { traductorPara } from "../idiomas/textos.service.js";

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
 * aporta su cotización (la estrategia del rubro, modules/negocio/registro.js).
 */

const SELECT_TIENDA = {
  id: true, slug: true, nombre: true, email: true, whatsappNumero: true, direccion: true,
  logoUrl: true, activo: true, tipoNegocio: true
};

export const INCLUDE_RESERVA = {
  reserva: {
    include: {
      producto: {
        select: {
          id: true, nombre: true, slug: true, traducciones: true,
          imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
          tour: { select: { duracion: true, puntoEncuentro: true, mapaUrl: true, recojo: true } },
          evento: { select: { lugar: true, direccion: true, mapaUrl: true, organizador: true } }
        }
      },
      modalidad: true,
      funcion: { select: { id: true, nombre: true, inicio: true, fin: true } }
    }
  },
  itemsEvento: true,
  // Entradas con QR (plantillas-por-rubro E6)
  entradasEvento: { orderBy: { numero: "asc" } },
  // Pago dividido de canchas (plantillas-por-rubro E7)
  partesPago: { orderBy: { numero: "asc" } },
  // Locales: plan de pagos (alquiler-locales R7).
  cuotas: { orderBy: { numero: "asc" } },
  cambios: { orderBy: { fechaRegistro: "asc" } },
  detalles: true,
  pagos: { orderBy: { fechaRegistro: "asc" } },
  historialEstados: { orderBy: { fechaRegistro: "asc" } }
};

/** Tipos de pedido que son reservas (comparten bandeja, pago y seguimiento). */
export const TIPOS_RESERVA = ["hotel", "tour", "evento", "local", "cancha"];

const MOTIVOS_RECHAZO = {
  hotel: {
    sin_disponibilidad: "No hay disponibilidad para esa fecha",
    fecha_cerrada: "{Negocio} no recibe reservas esa fecha"
  },
  tour: {
    sin_disponibilidad: "No hay cupo en esa salida",
    fecha_cerrada: "No hay salida en esa fecha"
  },
  cancha: {
    sin_disponibilidad: "Ese horario ya no está disponible",
    fecha_cerrada: "La cancha no atiende esa fecha"
  }
};

/** Nota del historial de una reserva nueva según su estado inicial; la vertical puede poner las suyas. */
const NOTAS_INICIALES = {
  solicitada: "Solicitud enviada desde la vitrina",
  aceptada: "Reserva con pago directo desde la vitrina",
  // Hotel o tour con cobro en destino y confirmación inmediata.
  confirmada: "Reserva confirmada desde la vitrina: se paga al llegar"
};

const usuarioDe = (user) => user?.email ?? user?.id ?? null;

/** Con plan de pagos (locales) se paga por cuotas (cuotas.service), no por el flujo de un solo pago. */
export const conPlanDePagos = (pedido) => Boolean(rubroDePedido(pedido.tipo)?.planDePagos);

function exigirPagoUnico(pedido) {
  if (!conPlanDePagos(pedido)) return;
  const message = "Esta reserva se paga por cuotas: usa el plan de pagos";
  throw new ConflictError(message, { message, motivo: "USAR_CUOTAS" });
}

/** Estado efectivo de un pedido-reserva (con el apartado de eventos). */
export const efectivoDe = (pedido, ahora) => {
  const r = pedido.reserva;
  return estadoEfectivo({ estado: pedido.estado, inicio: r.inicio, fin: r.fin, apartadoHasta: r.apartadoHasta, tipo: r.tipo }, ahora);
};

/** Hasta cuándo queda apartado el cupo de una compra (nunca después de la función). */
/** Plazo para pagar: los minutos dados, sin pasar la hora de inicio (salvo una llegada tardía de hotel, que ya empezó). */
const nuevoApartado = (inicio, minutos, ahora) => {
  const limite = new Date(ahora.getTime() + minutos * 60 * 1000);
  return limite < inicio || inicio <= ahora ? limite : inicio;
};

/** Modo de confirmación efectivo: el de la estrategia del rubro (hotel con inventario: directo) o el de la tienda. */
const modoDe = (vertical, config, cotizado) => vertical.modoConfirmacion?.(config, cotizado) ?? config.modoConfirmacion;

/** Cuánto se aparta el cupo mientras se paga: corto en línea, largo para subir una captura (reserva-directa-hotel RD2). */
async function minutosApartado(tiendaId, config) {
  const { modo } = await modoEfectivo(tiendaId);
  return modo === "automatico" ? config.apartadoEnLineaMin : config.apartadoManualMin;
}
const redondear = (n) => Math.round(n * 100) / 100;

async function tiendaDeReservas(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: SELECT_TIENDA });
  if (!tienda || !tienda.activo) throw new NotFoundError("Tienda");
  // La vertical (cotizar, estadoInicial, enTransaccion…) es parte de la estrategia del rubro.
  const vertical = estrategiaDe(tienda).reservas;
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
  // Lo no atendido vence al terminar su plazo o, sin plazo, a la hora de inicio:
  // habitación apartada que no se pagó a tiempo (C1), local sin respuesta o sin
  // pago (alquiler-locales R6.4), llegada tardía de hotel al cerrar el día.
  await prisma.$executeRaw`
    UPDATE pedidos p SET estado = 'vencida', fecha_actualizacion = now()
    FROM reservas r
    WHERE r.pedido_id = p.id AND p.tienda_id = ${tiendaId}::uuid
      AND p.estado IN ('solicitada', 'aceptada') AND COALESCE(r.apartado_hasta, r.inicio) <= now()`;
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
      AND p.estado = 'confirmada' AND COALESCE(r.fin, r.inicio) <= now()
      AND NOT (r.tipo = ANY(${TIPOS_CON_CICLO}::text[]))`; // con ciclo de estadía la cierra el check-out
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
  const anterior = efectivoDe(pedido, ahora);
  const nuevo = transicionar(anterior, accion, pedido.tipo);
  const { count } = await tx.pedidos.updateMany({
    where: { id: pedido.id, tiendaId: pedido.tiendaId, estado: pedido.estado },
    data: { estado: nuevo, fechaActualizacion: ahora, ...datosPedido }
  });
  if (count === 0) {
    throw new ConflictError("La reserva cambió mientras la revisabas. Actualiza la página.", { message: "La reserva cambió mientras la revisabas. Actualiza la página.", motivo: "RESERVA_MODIFICADA" });
  }
  await tx.pedido_historial_estados.create({ data: { pedidoId: pedido.id, estado: nuevo, notas: nota } });
  // La vertical mantiene su inventario en la misma transacción (canchas: la ocupación del
  // horario; locales: la franja; eventos: las entradas vendidas).
  await verticalDePedido(pedido.tipo)?.alCambiarEstado?.(tx, { pedido, anterior, nuevo, ahora });
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
  const cotizado = await vertical.cotizar({ tiendaId: datos.tiendaId, datos, config, ahora });
  const { c } = cotizado;
  // Con el modo efectivo la vitrina elige textos y flujo sin preguntar por el rubro (reserva-directa-hotel RD7).
  const base = { ...serializarCotizacion(c), modoConfirmacion: modoDe(vertical, config, cotizado) };
  // Lo que una vertical agrega a la cotización (locales: separación, garantía y si la franja está libre, R3.5, R4.1).
  if (vertical.extraCotizacion) return { ...base, ...await vertical.extraCotizacion(datos.tiendaId, datos, c, ahora) };
  return base;
}

const serializarCotizacion = (c) => ({
  inicio: c.inicio, fin: c.fin, noches: c.noches, horas: c.horas, personas: c.personas ?? null, lineas: c.lineas,
  total: c.total, montoAPagar: c.montoAPagar, saldoDestino: c.saldoDestino, aviso: c.aviso, errores: c.errores,
  // Hotel (hospedaje-completo B5): IGV exonerado o cuánto pagaría un extranjero.
  exoneradoIgv: c.exoneradoIgv ?? false, totalExtranjero: c.totalExtranjero ?? null,
  // reserva-hotel-mejoras H2: desglose de IGV y servicio (null en los rubros que no lo calculan).
  impuestos: c.impuestos ?? null,
  // Fase C: habitaciones, plan y cupo ("Quedan 2").
  habitaciones: c.habitaciones ?? 1, plan: c.plan ?? null, quedan: c.quedan ?? null,
  // Adelanto o total para elegir (C8); null si la tienda no lo ofrece.
  opcionesPago: c.opcionesPago ?? null,
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
        { OR: [{ clienteWhatsapp: whatsapp }, ...(docNumero ? [{ reserva: { titularDocNumero: docNumero } }] : [])] }
      ]
    }
  });
  if (abiertas >= max) {
    const message = vertical.mensajeMaxAbiertas?.(abiertas, vertical.este)
      ?? `Ya tienes ${abiertas} solicitudes en curso en ${vertical.este}. Espera la respuesta o cancela alguna.`;
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
  // Con términos y condiciones, aceptarlos es obligatorio (reserva-hotel-mejoras H4.1).
  if (config.terminos && !datos.aceptaTerminos) {
    throw new ValidationError("Debes aceptar los términos y condiciones", { message: "Debes aceptar los términos y condiciones", field: "aceptaTerminos", motivo: "TERMINOS" });
  }
  // Lo obligatorio del formulario de la tienda, y fuera lo que no pide.
  aplicarFormulario(datos, config.formulario ?? formularioDe(tienda.tipoNegocio, null));
  const cotizado = await vertical.cotizar({ tiendaId: tienda.id, datos, config, ahora });
  const { producto, c, detalle, log, inventario = null } = cotizado;
  if (c.errores.length) {
    throw new ValidationError(c.errores[0].mensaje, { motivo: "RESERVA_NO_VALIDA", errores: c.errores });
  }

  const whatsapp = datos.whatsapp.replace(/[\s-]/g, "");
  const docNumero = datos.titular.docNumero?.toUpperCase() ?? null;
  await validarSolicitudesAbiertas(tienda.id, vertical, { whatsapp, docNumero }, config.maxSolicitudesAbiertas, ahora);

  // Pago directo sin nada que pagar por adelantado (cobro en destino): la
  // reserva nace confirmada; se paga al llegar (hospedaje-completo A6).
  const estadoInicial = vertical.estadoInicial?.(c)
    ?? (modoDe(vertical, config, cotizado) === "pago_directo" ? (c.montoAPagar > 0 ? "aceptada" : "confirmada") : "solicitada");
  // Hotel con inventario: la habitación queda apartada mientras paga (en línea
  // o subiendo la captura); si no paga a tiempo, la reserva se anula y el cupo
  // vuelve (C1, reserva-directa-hotel RD2).
  if (inventario && estadoInicial === "aceptada") detalle.apartadoHasta = nuevoApartado(c.inicio, await minutosApartado(tienda.id, config), ahora);
  // Locales: la solicitud aparta la fecha durante el plazo de respuesta (R6.4).
  if (vertical.apartadoInicial) detalle.apartadoHasta = vertical.apartadoInicial(estadoInicial, c, config, ahora);
  // Idioma en que reservó el huésped (lo resuelve la ruta): los correos le llegan en ese idioma (docs/specs/idiomas D11).
  detalle.idiomaHuesped = datos.lang ?? IDIOMA_BASE;
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
              // La vertical pone las suyas (eventos: compra apartada, entradas libres).
              notas: { ...NOTAS_INICIALES, ...vertical.notasIniciales }[estadoInicial]
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
              horaLlegada: datos.horaLlegada ?? null,
              acompanantes: datos.acompanantes.length
                ? datos.acompanantes.map(a => ({ ...a, docNumero: a.docNumero.toUpperCase() }))
                : undefined,
              comentarios: datos.comentarios,
              aceptaDatos: true,
              aceptaTerminos: !!config.terminos && !!datos.aceptaTerminos,
              aceptaPromociones: !!datos.aceptaPromociones,
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
export async function notificarSolicitud({ pedido, tienda, config, token }) {
  try {
    const dtoCliente = serializeReservaStore(pedido, { tienda, config });
    // Al cliente, en el idioma en que reservó (docs/specs/idiomas D11); al negocio, en el base.
    const t = await traductorPara(tienda.id, dtoCliente.idiomaHuesped);
    // Con confirmación inmediata (pago directo) no hay solicitud que responder:
    // la reserva nace aceptada (por pagar) o confirmada (se paga al llegar).
    // Una compra de entradas nace por pagar o, si es gratis, confirmada.
    const alCliente = {
      solicitada: solicitudRecibidaEmail, aceptada: aceptadaEmail, confirmada: confirmadaEmail, por_pagar: compraPendienteEmail
    }[pedido.estado] ?? solicitudRecibidaEmail;
    enviar(pedido.clienteEmail, alCliente(dtoCliente, urlSeguimiento(tienda.slug, token), t), tienda.email);
    // Compra de entradas: el organizador no tiene nada que responder; se le avisa al subir la captura.
    if (verticalDePedido(pedido.tipo)?.avisaAlNegocio === false) return;
    const dtoNegocio = serializeReservaAdmin(pedido);
    enviar(tienda.email, (pedido.estado === "solicitada" ? nuevaSolicitudEmail : nuevaReservaEmail)(dtoNegocio), pedido.clienteEmail);
  } catch (error) {
    logger.warn(`📭 Reservas: no se avisó la solicitud ${pedido?.numeroPedido}: ${error.message}`);
  }
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
  });
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

/**
 * El cliente sube la captura del pago manual (R7.2). Se puede volver a subir
 * mientras está en revisión (por ejemplo, si se equivocó de imagen).
 */
export async function subirCapturaCliente(tiendaId, pedidoId, { file, metodo, numeroOperacion }, ahora = new Date()) {
  // Con pago automático no hay capturas (docs/specs/pago-automatico R3.7).
  await exigirManual(tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirPagoUnico(pedido);
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

/**
 * Abierta y todavía a tiempo: con plazo (apartado de locales o habitación, llegada
 * tardía de hotel), hasta que termine; sin plazo, hasta la hora de inicio.
 */
const abiertaVigente = (ahora) => ({ OR: [{ apartadoHasta: null, inicio: { gt: ahora } }, { apartadoHasta: { gt: ahora } }] });
const cuotaEnRevision = { tipo: "local", cuotas: { some: { estado: "en_revision" } } };

function wherePestana(pestana, ahora) {
  switch (pestana) {
    case "por_responder": return { estado: "solicitada", reserva: abiertaVigente(ahora) };
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
        { estado: "aceptada", reserva: abiertaVigente(ahora) },
        { estado: "por_pagar", reserva: { inicio: { gt: ahora }, apartadoHasta: { gt: ahora } } },
        { estado: "confirmada", reserva: { fin: { gt: ahora } } },
        // Hotel: confirmadas con la fecha pasada esperan check-in o no-show; hospedadas, el check-out.
        { estado: "confirmada", tipo: { in: TIPOS_CON_CICLO } },
        { estado: "hospedada" }
      ]
    };
    default: return {
      estado: { in: ["completada", "rechazada", "vencida", "cancelada", "no_show"] }
    };
  }
}

/** Reservas cuyas notas de recepción contienen el texto (búsqueda de la bandeja). */
async function conNotaQueDice(tiendaId, q) {
  const filas = await prisma.$queryRaw`
    SELECT pedido_id FROM reservas
    WHERE tienda_id = ${tiendaId}::uuid AND jsonb_array_length(notas) > 0 AND notas::text ILIKE ${`%${q}%`}
    LIMIT 200`;
  return filas.map(f => f.pedido_id);
}

/** Día de hoy en Lima como rango de instantes. */
const hoyLima = (ahora) => ({ gte: instanteLima(fechaLima(ahora)), lt: instanteLima(sumarDias(fechaLima(ahora), 1)) });

/**
 * Bandeja del hotel (ciclo-reserva-hotel C10): el ciclo de recepción y el
 * resumen de hoy. Por confirmar junta lo que espera respuesta, pago o verificación.
 */
export function whereHotel(filtro, ahora) {
  const porConfirmar = { OR: [{ estado: { in: ["solicitada", "aceptada"] }, reserva: abiertaVigente(ahora) }, { estado: "pago_en_revision" }] };
  switch (filtro) {
    case "por_confirmar": return porConfirmar;
    case "atender": return porConfirmar;
    case "reservada": return { estado: "confirmada" };
    case "ocupada": return { estado: "hospedada" };
    case "finalizada": return { estado: "completada" };
    case "no_llego": return { estado: "no_show" };
    case "anulada": return { estado: { in: ["rechazada", "vencida", "cancelada"] } };
    case "llegadas": return { estado: { in: ["confirmada", "hospedada"] }, reserva: { inicio: hoyLima(ahora) } };
    case "salidas": return { estado: { in: ["hospedada", "completada"] }, reserva: { fin: hoyLima(ahora) } };
    default: return { OR: [porConfirmar, { estado: { in: ["confirmada", "hospedada"] } }] };
  }
}

/**
 * Resumen de hoy y contador de cada estado del ciclo (ciclo-reserva-hotel C10.1-2).
 * Llegadas y salidas cuentan las ya registradas y las que faltan.
 */
export async function resumenHotel(tiendaId, ahora = new Date()) {
  await persistirVencimientos(tiendaId);
  const contar = (where) => prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_CON_CICLO }, ...where } });
  const hoy = hoyLima(ahora);
  const [llegadas, llegadasPendientes, salidas, salidasPendientes, ...estados] = await Promise.all([
    contar(whereHotel("llegadas", ahora)),
    contar({ estado: "confirmada", reserva: { inicio: hoy } }),
    contar(whereHotel("salidas", ahora)),
    contar({ estado: "hospedada", reserva: { fin: hoy } }),
    ...["activas", "por_confirmar", "reservada", "ocupada", "finalizada", "no_llego", "anulada"].map(f => contar(whereHotel(f, ahora)))
  ]);
  const [activas, porConfirmar, reservada, ocupada, finalizada, noLlego, anulada] = estados;
  return {
    hoy: fechaLima(ahora),
    llegadas: { total: llegadas, pendientes: llegadasPendientes },
    ocupadas: ocupada,
    salidas: { total: salidas, pendientes: salidasPendientes },
    porAtender: porConfirmar,
    estados: { activas, por_confirmar: porConfirmar, reservada, ocupada, finalizada, no_llego: noLlego, anulada }
  };
}

/** Cuántas reservas hay en una pestaña de la bandeja (franja de atención del dashboard). */
export function contarPestana(tiendaId, pestana, ahora = new Date()) {
  return prisma.pedidos.count({ where: { tiendaId, tipo: { in: TIPOS_RESERVA }, ...wherePestana(pestana, ahora) } });
}

/** Bandeja (R11.1): las abiertas, por hora de inicio; el historial, lo más reciente primero. */
/**
 * "Mis reservas" del comprador con sesión en la tienda (Mi cuenta; layout-por-rubro 3.5):
 * la más próxima o reciente primero, con el estado que ve el cliente y el link
 * firmado de seguimiento, que es donde se gestiona la reserva.
 * @param {string} tiendaId
 * @param {string} authUserId - req.user.id, nunca del request
 */
export async function listarReservasCuenta(tiendaId, authUserId, ahora = new Date()) {
  const pedidos = await prisma.pedidos.findMany({
    where: { tiendaId, authUserId, tipo: { in: TIPOS_RESERVA }, reserva: { isNot: null } },
    orderBy: { fechaServicio: "desc" },
    take: 50,
    select: {
      id: true, numeroPedido: true, estado: true, total: true,
      reserva: { select: { tipo: true, inicio: true, fin: true, apartadoHasta: true, producto: { select: { nombre: true } } } }
    }
  });
  return Promise.all(pedidos.map(async ({ id, numeroPedido, estado, total, reserva: r }) => ({
    numeroPedido,
    tipo: r.tipo,
    nombre: r.producto.nombre,
    inicio: r.inicio,
    fin: r.fin,
    estado: estadoEfectivo({ estado, inicio: r.inicio, fin: r.fin, apartadoHasta: r.apartadoHasta, tipo: r.tipo }, ahora),
    total: Number(total),
    token: await firmarTokenReserva({ pedidoId: id, tiendaId })
  })));
}

export async function listarReservasAdmin(tiendaId, filtros, ahora = new Date()) {
  await persistirVencimientos(tiendaId);
  const { pestana, estadoHotel, sinPms, conNotas, productoId, desde, hasta, q, page, limit } = filtros;

  const and = [{ tiendaId, tipo: { in: TIPOS_RESERVA } }, estadoHotel ? whereHotel(estadoHotel, ahora) : wherePestana(pestana, ahora)];
  if (productoId) and.push({ reserva: { productoId } });
  if (sinPms) and.push({ reserva: { codigoPms: null } });
  if (conNotas) and.push({ reserva: { NOT: { notas: { equals: [] } } } });
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
        { reserva: { titularDocNumero: contiene } },
        { reserva: { codigoPms: contiene } },
        { id: { in: await conNotaQueDice(tiendaId, q) } }
      ]
    });
  }
  const where = { AND: and };
  const pasadas = pestana === "historial" || ["finalizada", "no_llego", "anulada"].includes(estadoHotel);
  const orderBy = pasadas ? [{ fechaServicio: "desc" }] : [{ fechaServicio: "asc" }];

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
  // En el idioma en que reservó (docs/specs/idiomas D11).
  const t = await traductorPara(tiendaId, dto.idiomaHuesped);
  enviar(pedido.clienteEmail, plantilla(dto, urlSeguimiento(tienda.slug, token), t), tienda.email);
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
  if (conPlanDePagos(pedido)) return aceptarConPlanDePagos(tiendaId, pedido, { nuevoTotal, ajusteMotivo }, user, ahora);
  const config = await obtenerConfig(tiendaId);
  // La vertical revisa lo suyo antes de aceptar (hotel: el cupo); `forzar` lo salta.
  if (!forzar) await verticalDePedido(pedido.tipo)?.alAceptar?.({ tiendaId, pedido, ahora });
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
async function aceptarConPlanDePagos(tiendaId, pedido, { nuevoTotal, ajusteMotivo }, user, ahora) {
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
  });
  await correoCliente(tiendaId, pedidoId, rechazadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

const pagoPendiente = (pedido) => [...pedido.pagos].reverse()
  .find(p => p.proveedor === "manual" && p.estado === "pendiente");

/** "Pago verificado" (R7.3): confirma la reserva y registra lo pagado. */
export async function verificarPago(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirPagoUnico(pedido);
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
    // Entradas: el cupo apartado pasa a vendido en alCambiarEstado de su vertical.
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
  exigirPagoUnico(pedido);
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
    // Lo que vivía apartado (entradas pagadas, una habitación apartada C1) vuelve a
    // esperar el pago con un apartado nuevo para que suba otra captura.
    if (pedido.reserva.apartadoHasta) {
      const config = await obtenerConfig(tiendaId);
      await tx.reservas.update({ where: { pedidoId }, data: { apartadoHasta: nuevoApartado(pedido.reserva.inicio, config.apartadoManualMin, ahora) } });
    }
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** El negocio cancela una reserva confirmada (R12.2). El reembolso se gestiona fuera. */
export async function cancelarPorNegocio(tiendaId, pedidoId, { motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  // Entradas vendidas y franjas de locales: las devuelve la vertical (alCambiarEstado).
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "cancelar_negocio", {
      ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota: motivo ? `Cancelada por el negocio: ${motivo}` : "Cancelada por el negocio"
    });
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
      estado: { in: ["aceptada", "por_pagar", "pago_en_revision", "confirmada", "hospedada", "completada"] },
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
