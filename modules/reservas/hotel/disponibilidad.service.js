import { prisma } from "../../../config/prisma.js";
import { fechaLima, instanteLima, rangoFechas, sumarDias } from "../tiempo.js";
import { ocupaNoche } from "./recepcion.js";

/**
 * Inventario del hotel (docs/specs/hospedaje-completo C1): cuántas
 * habitaciones (o camas, en un tipo de dormitorio) quedan libres cada noche.
 *
 * Ocupan cupo las reservas confirmadas, con pago en revisión y aceptadas; una
 * aceptada con confirmación inmediata solo mientras dura su apartado (si no
 * paga a tiempo, se anula y el cupo vuelve). Una solicitud sin responder no
 * ocupa: el negocio decide al aceptarla. Las estadías por horas no usan el
 * inventario de noches; las de noche registradas en Recepción, sí. También
 * ocupa lo vendido fuera de la web (motor-reservas-hotel M2: `hotel_cupo_externo`).
 */

const ESTADOS_QUE_OCUPAN = ["aceptada", "pago_en_revision", "confirmada", "hospedada"];

/** Noches ("YYYY-MM-DD") de una estadía que empieza el día `fecha`. */
export const nochesDe = (fecha, noches) => rangoFechas(fecha, sumarDias(fecha, noches - 1));

/** Unidades que consume una reserva: sus habitaciones (o camas, en un tipo de dormitorio). */
export const unidadesDe = (r) => r.habitaciones ?? 1;

/**
 * ¿Ocupa cupo? Pura, para testearla.
 * @param {{ estado: string, apartadoHasta: Date|null }} r
 */
export function ocupaCupo(r, ahora) {
  if (!ESTADOS_QUE_OCUPAN.includes(r.estado)) return false;
  return !(r.estado === "aceptada" && r.apartadoHasta && r.apartadoHasta <= ahora);
}

const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const aIso = (d) => d.toISOString().slice(0, 10);

/**
 * Lo vendido fuera de la web (motor-reservas-hotel M2), por tipo y noche.
 * @returns {Promise<Map<string, Map<string, { manual: number, ical: number }>>>}
 */
export async function externasPorTipo(db, tiendaId, productoIds, desde, hasta) {
  const filas = await db.hotel_cupo_externo.findMany({
    where: { tiendaId, productoId: { in: productoIds }, fecha: { gte: aFecha(desde), lte: aFecha(hasta) } },
    select: { productoId: true, fecha: true, origen: true, ocupadas: true }
  });
  const mapa = new Map();
  for (const f of filas) {
    const porFecha = mapa.get(f.productoId) ?? new Map();
    const dia = porFecha.get(aIso(f.fecha)) ?? { manual: 0, ical: 0 };
    dia[f.origen === "ical" ? "ical" : "manual"] += f.ocupadas;
    porFecha.set(aIso(f.fecha), dia);
    mapa.set(f.productoId, porFecha);
  }
  return mapa;
}

/**
 * Ocupación por tipo y noche entre `desde` y `hasta` (inclusive).
 * @param {object} db - prisma o una transacción (para revalidar con bloqueo)
 * @param {{ externas?: boolean }} opciones - `externas: false` cuenta solo lo del sistema (web y mostrador)
 * @returns {Promise<Map<string, Map<string, number>>>} productoId → (fecha → unidades ocupadas)
 */
export async function ocupacion(db, tiendaId, tipos, desde, hasta, { ahora = new Date(), excluirPedidoId = null, externas = true } = {}) {
  const filas = await db.reservas.findMany({
    where: {
      tiendaId, tipo: "hotel", productoId: { in: tipos.map(t => t.productoId) }, noches: { not: null },
      inicio: { lt: instanteLima(sumarDias(hasta, 1), "00:00") },
      fin: { gt: instanteLima(desde, "00:00") },
      ...(excluirPedidoId ? { pedidoId: { not: excluirPedidoId } } : {}),
      pedido: { estado: { in: ESTADOS_QUE_OCUPAN } }
    },
    select: {
      productoId: true, inicio: true, noches: true, habitaciones: true, apartadoHasta: true,
      pedido: { select: { estado: true } }
    }
  });
  const mapa = new Map();
  for (const r of filas) {
    if (!ocupaCupo({ estado: r.pedido.estado, apartadoHasta: r.apartadoHasta }, ahora)) continue;
    const unidades = unidadesDe(r);
    const porFecha = mapa.get(r.productoId) ?? new Map();
    for (const f of nochesDe(fechaLima(r.inicio), r.noches)) {
      if (f < desde || f > hasta) continue;
      porFecha.set(f, (porFecha.get(f) ?? 0) + unidades);
    }
    mapa.set(r.productoId, porFecha);
  }
  // Recepción (docs/specs/recepcion R3.4): quien entró por noche en el mostrador también ocupa.
  const estadias = await db.hotel_estadias.findMany({
    where: {
      // Sin las llegadas de reservas web (R3.5): esas noches ya las cuenta la reserva.
      tiendaId, productoId: { in: tipos.map(t => t.productoId) }, estado: "en_curso", modalidad: "noche", pedidoId: null,
      inicio: { lt: instanteLima(sumarDias(hasta, 1), "00:00") },
      fin: { gt: instanteLima(sumarDias(desde, 1), "00:00") }
    },
    select: { productoId: true, modalidad: true, inicio: true, fin: true }
  });
  for (const e of estadias) {
    const porFecha = mapa.get(e.productoId) ?? new Map();
    for (const f of rangoFechas(desde, hasta)) {
      if (ocupaNoche(e, f)) porFecha.set(f, (porFecha.get(f) ?? 0) + 1);
    }
    mapa.set(e.productoId, porFecha);
  }
  if (externas) {
    const ext = await externasPorTipo(db, tiendaId, tipos.map(t => t.productoId), desde, hasta);
    for (const [productoId, dias] of ext) {
      const porFecha = mapa.get(productoId) ?? new Map();
      for (const [f, { manual, ical }] of dias) porFecha.set(f, (porFecha.get(f) ?? 0) + manual + ical);
      mapa.set(productoId, porFecha);
    }
  }
  return mapa;
}

/**
 * Solicitudes sin responder por tipo y noche: no ocupan, pero la grilla del
 * admin las muestra ("+N por responder") para decidir antes de aceptarlas.
 * @returns {Promise<Map<string, Map<string, number>>>}
 */
export async function solicitudesPorNoche(db, tiendaId, productoIds, desde, hasta) {
  const filas = await db.reservas.findMany({
    where: {
      tiendaId, tipo: "hotel", productoId: { in: productoIds }, noches: { not: null },
      inicio: { lt: instanteLima(sumarDias(hasta, 1), "00:00") },
      fin: { gt: instanteLima(desde, "00:00") },
      pedido: { estado: "solicitada" }
    },
    select: { productoId: true, inicio: true, noches: true, habitaciones: true }
  });
  const mapa = new Map();
  for (const r of filas) {
    const porFecha = mapa.get(r.productoId) ?? new Map();
    for (const f of nochesDe(fechaLima(r.inicio), r.noches)) {
      if (f >= desde && f <= hasta) porFecha.set(f, (porFecha.get(f) ?? 0) + unidadesDe(r));
    }
    mapa.set(r.productoId, porFecha);
  }
  return mapa;
}

/**
 * Libres en la noche más llena de una estadía, o null si el tipo no lleva
 * inventario. Es lo que la cotización compara con lo que se pide.
 * @param {{ productoId: string, unidades: number|null }} tipo
 */
export async function cupoEstadia(db, tiendaId, tipo, fecha, noches, opciones = {}) {
  if (tipo.unidades == null || !noches) return null;
  const fechas = nochesDe(fecha, noches);
  const ocupadas = (await ocupacion(db, tiendaId, [tipo], fechas[0], fechas.at(-1), opciones)).get(tipo.productoId) ?? new Map();
  const llena = Math.max(0, ...fechas.map(f => ocupadas.get(f) ?? 0));
  return { unidades: tipo.unidades, libres: Math.max(tipo.unidades - llena, 0) };
}

/**
 * Disponibilidad de todos los tipos con inventario entre dos fechas: para la
 * grilla de la vitrina (ocultar los llenos) y la vista del admin.
 *
 * `detalle` (admin, motor-reservas-hotel M2.4): separa lo del sistema de lo
 * vendido fuera de la web, suma las solicitudes por responder e incluye los
 * tipos sin inventario (con `unidades: null` y sin fechas) para invitar a cargarlo.
 * @returns {Promise<Array<{ productoId, nombre, unidades, fechas: Record<string, { ocupadas, libres }> }>>}
 */
export async function disponibilidadTienda(tiendaId, desde, hasta, { ahora = new Date(), conNombre = false, detalle = false } = {}) {
  if (detalle) return disponibilidadDetalle(tiendaId, desde, hasta, ahora);
  const tipos = await prisma.hotel_tipos_habitacion.findMany({
    where: { tiendaId, unidades: { not: null }, producto: { activo: true } },
    select: { productoId: true, unidades: true, ...(conNombre ? { producto: { select: { nombre: true } } } : {}) }
  });
  if (!tipos.length) return [];
  const mapa = await ocupacion(prisma, tiendaId, tipos, desde, hasta, { ahora });
  const fechas = rangoFechas(desde, hasta);
  return tipos.map(t => {
    const ocupadas = mapa.get(t.productoId) ?? new Map();
    return {
      productoId: t.productoId,
      ...(conNombre ? { nombre: t.producto.nombre } : {}),
      unidades: t.unidades,
      fechas: Object.fromEntries(fechas.map(f => {
        const o = ocupadas.get(f) ?? 0;
        return [f, { ocupadas: o, libres: Math.max(t.unidades - o, 0) }];
      }))
    };
  });
}

async function disponibilidadDetalle(tiendaId, desde, hasta, ahora) {
  const todos = await prisma.hotel_tipos_habitacion.findMany({
    where: { tiendaId, producto: { activo: true } },
    orderBy: { producto: { nombre: "asc" } },
    select: { productoId: true, unidades: true, producto: { select: { nombre: true } } }
  });
  const tipos = todos.filter(t => t.unidades != null);
  const ids = tipos.map(t => t.productoId);
  const [propias, externas, solicitudes] = tipos.length
    ? await Promise.all([
      ocupacion(prisma, tiendaId, tipos, desde, hasta, { ahora, externas: false }),
      externasPorTipo(prisma, tiendaId, ids, desde, hasta),
      solicitudesPorNoche(prisma, tiendaId, ids, desde, hasta)
    ])
    : [new Map(), new Map(), new Map()];
  const fechas = rangoFechas(desde, hasta);
  return todos.map(t => ({
    productoId: t.productoId,
    nombre: t.producto.nombre,
    unidades: t.unidades,
    fechas: t.unidades == null ? {} : Object.fromEntries(fechas.map(f => {
      const enSistema = propias.get(t.productoId)?.get(f) ?? 0;
      const { manual, ical } = externas.get(t.productoId)?.get(f) ?? { manual: 0, ical: 0 };
      const ocupadas = enSistema + manual + ical;
      return [f, {
        ocupadas, libres: Math.max(t.unidades - ocupadas, 0),
        // Negativo = sobrevendida (se aceptó sin cupo o el dueño corrigió tarde).
        saldo: t.unidades - ocupadas,
        enSistema, fueraDeLaWeb: { manual, ical },
        porResponder: solicitudes.get(t.productoId)?.get(f) ?? 0
      }];
    }))
  }));
}

/** Bloquea el tipo de habitación hasta el fin de la transacción (dos reservas a la vez no se llevan la última). */
export async function bloquearTipo(tx, productoId) {
  await tx.$queryRaw`SELECT producto_id FROM hotel_tipos_habitacion WHERE producto_id = ${productoId}::uuid FOR UPDATE`;
}
