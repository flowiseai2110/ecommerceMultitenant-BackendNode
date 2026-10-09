import { prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { urlTienda } from "../../resenas/resenas.service.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { cierresDeProducto } from "../cierres.service.js";
import { temporadasParaEstadia } from "../hotel/tarifas.service.js";
import { fechaLima, horaLima, instanteLima, sumarDias, sumarHoras } from "../tiempo.js";
import { cotizarLocal, etiquetaTipoEvento, separacionDe } from "./cotizar.js";
import { franjaDe } from "./franja.js";
import { alternativas, calendario } from "./disponibilidad.js";
import { FechaNoDisponibleError, MENSAJE_NO_DISPONIBLE, ocupacionesVigentes, ocupar } from "./ocupaciones.js";
import { generarPlan } from "./plan-pagos.js";
import { datosContrato, hashContrato, renderContrato } from "./contrato.js";
import { cargarSalonParaReserva } from "./salones.service.js";
import { firmarTokenCotizacion, verificarTokenCotizacion } from "./cotizacion.token.js";

/**
 * Alquiler de locales (docs/specs/alquiler-locales): cotización con
 * disponibilidad, calendario, bloqueos manuales, cotizaciones guardadas y la
 * vertical `local` que usa reservas.service (Strategy, como hotel, tours y
 * eventos). Este módulo NO importa reservas.service: el flujo de la reserva
 * (estados, cuotas) vive allí y en cuotas.service.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));
const redondear = (n) => Math.round(n * 100) / 100;
const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const minDate = (a, b) => (a < b ? a : b);

/** 409 FECHA_NO_DISPONIBLE con hasta 3 franjas libres cercanas (R3.4). */
export function errorNoDisponible(alternativasLibres = []) {
  return new ConflictError(MENSAJE_NO_DISPONIBLE, { message: MENSAJE_NO_DISPONIBLE, motivo: "FECHA_NO_DISPONIBLE", alternativas: alternativasLibres });
}

async function tiendaLocales(tiendaId) {
  const config = await obtenerConfig(tiendaId);
  if (config.tipoNegocio !== "locales") {
    const message = "Esta tienda no alquila locales";
    throw new ValidationError(message, { message, motivo: "TIENDA_SIN_LOCALES" });
  }
  return config;
}

// ============================================
// Cotizar y disponibilidad
// ============================================

/**
 * Carga el salón, sus temporadas y cierres, y cotiza (sin BD en el cálculo).
 * @returns {Promise<{ producto, salon, turnos, paquete, cierres, c }>}
 */
export async function cotizarSalon(tiendaId, datos, config, ahora = new Date()) {
  const { producto, salon, turnos, paquetes } = await cargarSalonParaReserva(tiendaId, datos.productoId);
  const paquete = paquetes.find(p => p.id === datos.paqueteId) ?? null;
  const [temporadas, cierres] = await Promise.all([
    temporadasParaEstadia(tiendaId, salon.productoId, datos.fecha, datos.fecha),
    cierresDeProducto(tiendaId, salon.productoId, datos.fecha, datos.fecha)
  ]);
  const c = cotizarLocal({
    salon, turnos, paquete, turnoId: datos.turnoId, fecha: datos.fecha, horaInicio: datos.hora ?? datos.horaInicio ?? null,
    horas: datos.horas, invitados: datos.invitados, tipoEvento: datos.tipoEvento, proveedoresExternos: datos.proveedoresExternos,
    temporadas, cierres, config, ahora
  });
  return { producto, salon, turnos, paquete, cierres, c };
}

/** La franja ocupada de la cotización está libre (lectura; la BD decide al ocupar, R3.5). */
export async function franjaLibre(tiendaId, productoId, c, { ahora = new Date(), excluirPedidoId = null } = {}) {
  if (!c.ocupaInicio) return false;
  const ocupadas = await ocupacionesVigentes(tiendaId, [productoId], c.ocupaInicio, c.ocupaFin, { ahora, excluirPedidoId });
  return ocupadas.length === 0;
}

/** Hasta 3 franjas libres cercanas a la pedida, para el 409 (R3.4). */
export async function alternativasPara(tiendaId, { productoId, paqueteId, fecha, horaInicio = null, horas = null }, ahora = new Date()) {
  const { salon, turnos, paquetes } = await cargarSalonParaReserva(tiendaId, productoId);
  const paquete = paquetes.find(p => p.id === paqueteId);
  const desde = sumarDias(fecha, -15);
  const hasta = sumarDias(fecha, 16);
  const [ocupadas, cierres] = await Promise.all([
    ocupacionesVigentes(tiendaId, [productoId], instanteLima(desde), instanteLima(hasta), { ahora }),
    cierresDeProducto(tiendaId, productoId, desde, hasta)
  ]);
  const porHoras = paquete?.modalidad === "por_horas" && horaInicio && horas ? { horaInicio, horas } : null;
  return alternativas({
    fecha, salon, turnos, ocupadas, cierres, ahora, porHoras,
    // Solo turnos en que se ofrece el paquete (vacío = todos).
    turnoIds: paquete?.turnoIds ?? []
  });
}

/** Lo que /cotizar suma para un local: disponibilidad y alternativas (R3.5, R4.1). */
export async function extraCotizacionLocal(tiendaId, datos, c, ahora = new Date()) {
  const disponible = !c.errores.length && await franjaLibre(tiendaId, datos.productoId, c, { ahora });
  return {
    separacion: c.separacion,
    garantia: c.garantia,
    horaInicio: c.horaInicio,
    horaFin: c.horaFin,
    disponible,
    alternativas: !c.errores.length && !disponible ? await alternativasPara(tiendaId, { ...datos, horaInicio: c.horaInicio }, ahora) : []
  };
}

// ============================================
// Calendario (R3.1, R12.2) y bloqueos manuales (R3.6)
// ============================================

async function calendarioDe(tiendaId, productoId, desde, hasta, ahora) {
  const { salon, turnos } = await cargarSalonParaReserva(tiendaId, productoId);
  const [ocupadas, cierres] = await Promise.all([
    // Un día antes: un turno de la víspera que pasa la medianoche.
    ocupacionesVigentes(tiendaId, [productoId], instanteLima(sumarDias(desde, -1)), instanteLima(sumarDias(hasta, 2)), { ahora }),
    cierresDeProducto(tiendaId, productoId, desde, hasta)
  ]);
  return { salon, ocupadas, cierres, fechas: calendario({ desde, hasta, salon, turnos, ocupadas, cierres, ahora }) };
}

/** Vitrina: estado de cada fecha y turno. Sin datos de otras reservas. */
export async function calendarioStore(tiendaId, slug, { desde, hasta }, ahora = new Date()) {
  const producto = await prisma.productos.findFirst({ where: { tiendaId, slug, activo: true, salon: { isNot: null } }, select: { id: true } });
  if (!producto) throw new NotFoundError("Salón", "Salón no encontrado");
  const { fechas } = await calendarioDe(tiendaId, producto.id, desde, hasta, ahora);
  return { productoId: producto.id, fechas };
}

/** Admin: el calendario más las reservas, apartados, bloqueos y cierres del rango. */
export async function calendarioAdmin(tiendaId, { productoId, desde, hasta }, ahora = new Date()) {
  const { fechas, cierres } = await calendarioDe(tiendaId, productoId, desde, hasta, ahora);
  const filas = await prisma.local_ocupaciones.findMany({
    where: {
      tiendaId, productoId, activo: true, OR: [{ expiraEn: null }, { expiraEn: { gt: ahora } }],
      inicio: { lt: instanteLima(sumarDias(hasta, 2)) }, fin: { gt: instanteLima(sumarDias(desde, -1)) }
    },
    orderBy: { inicio: "asc" },
    include: { pedido: { select: { id: true, numeroPedido: true, clienteNombre: true, estado: true, reserva: { select: { inicio: true, fin: true, tipoEvento: true, invitados: true } } } } }
  });
  return {
    productoId,
    fechas,
    cierres,
    ocupaciones: filas.map(o => ({
      id: o.id,
      tipo: o.tipo,
      // La franja ocupada incluye la preparación; la del evento, no.
      ocupaInicio: o.inicio,
      ocupaFin: o.fin,
      inicio: o.pedido?.reserva?.inicio ?? o.inicio,
      fin: o.pedido?.reserva?.fin ?? o.fin,
      expiraEn: o.expiraEn,
      motivo: o.motivo,
      reserva: o.pedido ? {
        id: o.pedido.id, codigo: o.pedido.numeroPedido, cliente: o.pedido.clienteNombre, estado: o.pedido.estado,
        tipoEvento: o.pedido.reserva?.tipoEvento ?? null, invitados: o.pedido.reserva?.invitados ?? null
      } : null
    }))
  };
}

/**
 * Bloqueo manual ("vendida por WhatsApp", "evento propio"), R3.6 / CE-02:
 * ocupa la franja igual que una reserva. Sin turno ni horas, todo el día.
 */
export async function crearBloqueo(tiendaId, { productoId, fecha, turnoId = null, horaInicio = null, horaFin = null, motivo = null }, user) {
  await tiendaLocales(tiendaId);
  const { salon, turnos } = await cargarSalonParaReserva(tiendaId, productoId);
  let franja;
  if (turnoId) {
    const t = turnos.find(x => x.id === turnoId);
    if (!t) throw new ValidationError("Turno inválido", { message: "Turno inválido", body: { turnoId: ["Turno inválido"] } });
    franja = franjaDe(fecha, t.horaInicio, t.horaFin, salon.preparacionMin);
  } else if (horaInicio && horaFin) {
    franja = franjaDe(fecha, horaInicio, horaFin, salon.preparacionMin);
  } else {
    franja = franjaDe(fecha, "00:00", "00:00");
  }
  try {
    const id = await prisma.$transaction(tx => ocupar(tx, {
      tiendaId, productoId, tipo: "bloqueo", inicio: franja.ocupaInicio, fin: franja.ocupaFin, motivo, usuario: usuarioDe(user)
    }));
    return { id, productoId, tipo: "bloqueo", ocupaInicio: franja.ocupaInicio, ocupaFin: franja.ocupaFin, motivo };
  } catch (error) {
    if (error instanceof FechaNoDisponibleError) {
      const message = "Esa franja ya está ocupada por una reserva, un apartado u otro bloqueo";
      throw new ConflictError(message, { message, motivo: "FECHA_NO_DISPONIBLE" });
    }
    throw error;
  }
}

export async function eliminarBloqueo(tiendaId, id) {
  const { count } = await prisma.local_ocupaciones.updateMany({ where: { id, tiendaId, tipo: "bloqueo", activo: true }, data: { activo: false } });
  if (count === 0) throw new NotFoundError("Bloqueo");
}

// ============================================
// Cotizaciones guardadas (R4)
// ============================================

export function serializarCotizacion(row, { ahora = new Date(), admin = false } = {}) {
  const d = row.detalle ?? {};
  const s = d.snapshot ?? {};
  const usada = Boolean(row.pedidoId);
  return {
    id: row.id,
    productoId: row.productoId,
    salon: s.salon?.nombre ?? null,
    fecha: row.fecha.toISOString().slice(0, 10),
    horaInicio: row.horaInicio,
    horaFin: row.horaFin,
    horas: d.horas ?? null,
    turnoId: row.turnoId,
    turno: s.turno?.nombre ?? null,
    paqueteId: row.paqueteId,
    paquete: s.paquete ?? null,
    invitados: row.invitados,
    tipoEvento: row.tipoEvento,
    tipoEventoEtiqueta: etiquetaTipoEvento(row.tipoEvento),
    proveedoresExternos: d.proveedoresExternos ?? false,
    lineas: d.lineas ?? [],
    subtotal: num(d.subtotal ?? row.total),
    ajuste: row.ajusteMotivo ? { monto: num(row.ajusteMonto), motivo: row.ajusteMotivo } : null,
    total: num(row.total),
    separacion: num(d.separacion),
    garantia: num(d.garantia),
    venceEn: row.venceEn,
    usada,
    vigente: !usada && row.venceEn > ahora,
    estado: usada ? "usada" : row.venceEn > ahora ? "vigente" : "vencida",
    creadaPor: row.creadaPor,
    fechaRegistro: row.fechaRegistro,
    ...(admin ? {
      canalOrigen: row.canalOrigen,
      cliente: { nombre: row.clienteNombre, whatsapp: row.clienteWhatsapp, email: row.clienteEmail },
      pedidoId: row.pedidoId
    } : {})
  };
}

const urlCotizacion = (slug, token) => urlTienda(slug, `cotizacion/${token}`);

/**
 * Cotiza y guarda con el precio congelado (R4.2). El negocio puede ajustar el
 * total con motivo (R4.4). No aparta la fecha (R4.6), pero no se guarda una
 * cotización para una franja ya ocupada: responde 409 con alternativas.
 */
export async function crearCotizacion(tiendaId, datos, { creadaPor = "cliente", user = null, ahora = new Date() } = {}) {
  const config = await tiendaLocales(tiendaId);
  const { producto, c } = await cotizarSalon(tiendaId, datos, config, ahora);
  if (c.errores.length) throw new ValidationError(c.errores[0].mensaje, { message: c.errores[0].mensaje, motivo: "COTIZACION_NO_VALIDA", errores: c.errores });
  if (!await franjaLibre(tiendaId, producto.id, c, { ahora })) {
    throw errorNoDisponible(await alternativasPara(tiendaId, { ...datos, horaInicio: c.horaInicio }, ahora));
  }

  const ajusta = creadaPor === "negocio" && datos.nuevoTotal != null;
  const total = ajusta ? redondear(datos.nuevoTotal) : c.total;
  const separacion = ajusta ? separacionDe(total, config) : c.separacion;
  // Vence a los N días o al empezar el evento, lo que ocurra antes.
  const venceEn = minDate(sumarHoras(ahora, config.cotizacionVigenciaDias * 24), c.inicio);

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  const row = await prisma.local_cotizaciones.create({
    data: {
      tiendaId,
      productoId: producto.id,
      turnoId: c.snapshot.turno?.id ?? null,
      paqueteId: c.snapshot.paquete?.id ?? null,
      fecha: aFecha(c.fecha),
      horaInicio: c.horaInicio,
      horaFin: c.horaFin,
      invitados: datos.invitados,
      tipoEvento: datos.tipoEvento,
      detalle: {
        lineas: c.lineas, subtotal: c.total, total, separacion, garantia: c.garantia, horas: c.horas,
        inicio: c.inicio, fin: c.fin, ocupaInicio: c.ocupaInicio, ocupaFin: c.ocupaFin,
        proveedoresExternos: Boolean(datos.proveedoresExternos), snapshot: c.snapshot
      },
      total,
      venceEn,
      canalOrigen: datos.canalOrigen ?? null,
      creadaPor,
      ajusteMonto: ajusta ? redondear(total - c.total) : null,
      ajusteMotivo: ajusta ? datos.ajusteMotivo : null,
      clienteNombre: datos.cliente?.nombre ?? null,
      clienteWhatsapp: datos.cliente?.whatsapp?.replace(/[\s-]/g, "") ?? null,
      clienteEmail: datos.cliente?.email ?? null,
      usuarioRegistro: creadaPor === "negocio" ? usuarioDe(user) : "storefront"
    }
  });
  const token = await firmarTokenCotizacion({ cotizacionId: row.id, tiendaId });
  return { token, url: urlCotizacion(tienda.slug, token), cotizacion: serializarCotizacion(row, { ahora, admin: creadaPor === "negocio" }) };
}

async function cotizacionDelToken(token, tiendaIdEsperada = null) {
  const { cotizacionId, tiendaId } = await verificarTokenCotizacion(token);
  if (tiendaIdEsperada && tiendaIdEsperada !== tiendaId) throw new NotFoundError("Cotización", "Cotización no encontrada");
  const row = await prisma.local_cotizaciones.findFirst({ where: { id: cotizacionId, tiendaId } });
  if (!row) throw new NotFoundError("Cotización", "Cotización no encontrada");
  return row;
}

/** Vitrina: la cotización (vigente, vencida o usada) con su disponibilidad actual. */
export async function obtenerCotizacionStore(token, tiendaIdEsperada = null, ahora = new Date()) {
  const row = await cotizacionDelToken(token, tiendaIdEsperada);
  const dto = serializarCotizacion(row, { ahora });
  const d = row.detalle;
  const disponible = dto.vigente
    ? await franjaLibre(row.tiendaId, row.productoId, { ocupaInicio: new Date(d.ocupaInicio), ocupaFin: new Date(d.ocupaFin) }, { ahora })
    : false;
  return { ...dto, tiendaId: row.tiendaId, disponible };
}

export async function listarCotizacionesAdmin(tiendaId, { productoId, page = 1, limit = 20 } = {}, ahora = new Date()) {
  const where = { tiendaId, ...(productoId ? { productoId } : {}) };
  const [total, filas] = await Promise.all([
    prisma.local_cotizaciones.count({ where }),
    prisma.local_cotizaciones.findMany({ where, orderBy: { fechaRegistro: "desc" }, skip: (page - 1) * limit, take: limit })
  ]);
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  const data = await Promise.all(filas.map(async r => {
    const token = await firmarTokenCotizacion({ cotizacionId: r.id, tiendaId });
    return { ...serializarCotizacion(r, { ahora, admin: true }), token, url: urlCotizacion(tienda.slug, token) };
  }));
  const totalPages = Math.ceil(total / limit);
  return { data, meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
}

// ============================================
// Vertical `local` de reservas.service (Strategy)
// ============================================

/** La cotización congelada como resultado de cotizar (R4.2, CE-07). */
function cotizadoDesdeCotizacion(row) {
  const d = row.detalle;
  return {
    inicio: new Date(d.inicio), fin: new Date(d.fin), ocupaInicio: new Date(d.ocupaInicio), ocupaFin: new Date(d.ocupaFin),
    fecha: row.fecha.toISOString().slice(0, 10), horaInicio: row.horaInicio, horaFin: row.horaFin, horas: d.horas ?? null,
    personas: row.invitados, lineas: d.lineas, total: num(row.total), separacion: num(d.separacion), garantia: num(d.garantia),
    snapshot: d.snapshot, errores: [],
    ajuste: row.ajusteMotivo ? { monto: num(row.ajusteMonto), motivo: row.ajusteMotivo } : null
  };
}

/** Cotización usable para una solicitud: de la tienda, vigente y sin usar. */
async function cotizacionParaSolicitud(tiendaId, token, ahora) {
  const row = await cotizacionDelToken(token, tiendaId);
  if (row.pedidoId) {
    const message = "Esta cotización ya se usó para una solicitud";
    throw new ConflictError(message, { message, motivo: "COTIZACION_USADA" });
  }
  if (row.venceEn <= ahora) {
    const message = "Esta cotización venció. Cotiza de nuevo para ver el precio actual.";
    throw new ConflictError(message, { message, motivo: "COTIZACION_VENCIDA" });
  }
  return row;
}

export const verticalLocal = {
  tipoPedido: "local",
  este: "este local",

  /**
   * Con `cotizacionToken` respeta el precio congelado; sin ella, cotiza en el
   * momento. La separación es lo que se paga primero (montoAPagar).
   */
  async cotizar({ tiendaId, datos, config, ahora }) {
    let producto, c, cotizacion = null;
    if (datos.cotizacionToken) {
      cotizacion = await cotizacionParaSolicitud(tiendaId, datos.cotizacionToken, ahora);
      const { producto: p } = await cargarSalonParaReserva(tiendaId, cotizacion.productoId);
      producto = p;
      c = cotizadoDesdeCotizacion(cotizacion);
      if (c.inicio <= ahora) c.errores.push({ codigo: "FECHA_PASADA", mensaje: "Esa fecha ya pasó", campo: "fecha" });
    } else {
      ({ producto, c } = await cotizarSalon(tiendaId, datos, config, ahora));
    }
    // Por horas con pago directo se paga todo al reservar (R6.6).
    c.montoAPagar = config.modoConfirmacion === "pago_directo" && c.horas ? c.total : c.separacion;
    c.saldoDestino = 0;
    const invitados = cotizacion?.invitados ?? datos.invitados;
    const tipoEvento = cotizacion?.tipoEvento ?? datos.tipoEvento;
    return {
      producto, c,
      detalle: {
        turnoId: c.snapshot.turno?.id ?? null,
        paqueteId: c.snapshot.paquete?.id ?? null,
        cotizacionId: cotizacion?.id ?? null,
        invitados,
        tipoEvento,
        agasajado: datos.agasajado ?? null,
        horas: c.horas,
        local: { ...c.snapshot, fecha: c.fecha, horaInicio: c.horaInicio, horaFin: c.horaFin, proveedoresExternos: Boolean(cotizacion?.detalle?.proveedoresExternos ?? datos.proveedoresExternos) },
        ...(c.ajuste ? { ajusteMonto: c.ajuste.monto, ajusteMotivo: c.ajuste.motivo } : {})
      },
      ocupacion: { productoId: producto.id, inicio: c.ocupaInicio, fin: c.ocupaFin },
      cotizacion,
      log: `${tipoEvento}, ${invitados} invitados, ${c.inicio?.toISOString()}`
    };
  },

  /**
   * La solicitud aparta la fecha solo durante el plazo de respuesta (R6.2,
   * R6.4); con pago directo, mientras se paga (R6.6). Nunca pasa del inicio.
   */
  apartadoInicial(estadoInicial, c, config, ahora) {
    const horas = estadoInicial === "solicitada" ? config.respuestaHoras : config.apartadoManualMin / 60;
    return minDate(sumarHoras(ahora, horas), c.inicio);
  },

  /** Dentro de la transacción: ocupa la franja (la BD rechaza si se cruza) y marca la cotización usada. */
  async enTransaccion(tx, { tiendaId, pedidoId, estadoInicial, cotizado, apartadoHasta, config, ahora }) {
    await ocupar(tx, {
      tiendaId, pedidoId, productoId: cotizado.ocupacion.productoId,
      tipo: estadoInicial === "solicitada" ? "solicitud" : "apartado",
      inicio: cotizado.ocupacion.inicio, fin: cotizado.ocupacion.fin, expiraEn: apartadoHasta, usuario: "storefront"
    });
    if (cotizado.cotizacion) {
      const { count } = await tx.local_cotizaciones.updateMany({ where: { id: cotizado.cotizacion.id, tiendaId, pedidoId: null }, data: { pedidoId } });
      if (count === 0) {
        const message = "Esta cotización ya se usó para una solicitud";
        throw new ConflictError(message, { message, motivo: "COTIZACION_USADA" });
      }
    }
    // Pago directo (R6.6): no hay solicitud que aceptar; el plan y el contrato nacen con la reserva.
    if (estadoInicial === "aceptada") {
      const pedido = await tx.pedidos.findUnique({ where: { id: pedidoId }, include: { reserva: true } });
      const total = Number(pedido.total);
      const { separacion, cuotas, contrato } = await prepararAceptacion(tx, { pedido, config, total, ahora });
      await tx.reserva_cuotas.createMany({ data: filasCuotas(cuotas, { tiendaId, pedidoId, usuario: "storefront" }) });
      await tx.reservas.update({ where: { pedidoId }, data: { contrato, montoAPagar: separacion } });
    }
  },

  /** 23P01 al ocupar → 409 con alternativas, calculadas fuera de la transacción ya revertida. */
  async traducirError(error, { tiendaId, datos, cotizado, ahora }) {
    if (!(error instanceof FechaNoDisponibleError)) return error;
    const c = cotizado.c;
    const alt = await alternativasPara(tiendaId, {
      productoId: cotizado.producto.id, paqueteId: c.snapshot.paquete?.id, fecha: c.fecha,
      turnoId: c.snapshot.turno?.id, horaInicio: c.horaInicio, horas: c.horas ?? datos.horas
    }, ahora);
    return errorNoDisponible(alt);
  }
};

// ============================================
// Aceptación: plan de pagos y contrato (R6.5, R7.2, R8.2)
// ============================================

/** Contrato renderizado con su versión y hash. Lo acepta el cliente antes de pagar (R8.3). */
export function generarContrato({ tienda, config, pedido, total, cuotas, ahora = new Date() }) {
  const r = pedido.reserva;
  const texto = renderContrato(config.contratoPlantilla, datosContrato({
    tienda, config, cuotas, etiquetaEvento: etiquetaTipoEvento,
    reserva: {
      codigo: pedido.numeroPedido, titular: `${r.titularNombres} ${r.titularApellidos}`, docTipo: r.titularDocTipo, docNumero: r.titularDocNumero,
      fecha: fechaLima(r.inicio), horaInicio: horaLima(r.inicio), horaFin: horaLima(r.fin), invitados: r.invitados,
      tipoEvento: r.tipoEvento, agasajado: r.agasajado, total, local: r.local
    }
  }));
  return { version: config.contratoVersion, hash: hashContrato(texto), texto, generadoEn: ahora.toISOString(), aceptadoEn: null, ip: null, adendas: [] };
}

/**
 * Lo que la aceptación guarda: plan de pagos, contrato y hasta cuándo queda
 * apartada la fecha sin pagar.
 * @param {object} client - prisma o tx
 * @param {{ pedido: object, config: object, total: number, ahora?: Date }} p
 */
export async function prepararAceptacion(client, { pedido, config, total, ahora = new Date() }) {
  const r = pedido.reserva;
  const separacion = config.modoConfirmacion === "pago_directo" && r.horas ? total : separacionDe(total, config);
  const cuotas = generarPlan({
    total, separacion, garantia: Number(r.local?.garantia ?? 0), config,
    fechaEvento: fechaLima(r.inicio), hoy: fechaLima(ahora)
  });
  const tienda = await client.tiendas.findUnique({
    where: { id: pedido.tiendaId }, select: { nombre: true, razonSocial: true, ruc: true, direccion: true }
  });
  return {
    separacion,
    cuotas,
    contrato: generarContrato({ tienda, config, pedido, total, cuotas, ahora }),
    apartadoHasta: minDate(sumarHoras(ahora, config.apartadoHoras), r.inicio)
  };
}

/** Filas de `reserva_cuotas` de un plan. */
export const filasCuotas = (cuotas, { tiendaId, pedidoId, usuario = null }) => cuotas.map(c => ({
  tiendaId, pedidoId, numero: c.numero, concepto: c.concepto, monto: c.monto, venceEn: aFecha(c.venceEn), usuarioRegistro: usuario
}));
