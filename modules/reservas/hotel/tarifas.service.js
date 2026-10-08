import { prisma } from "../../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { fechaLima } from "../tiempo.js";
import { traducirFila } from "../../traducciones/traducciones.service.js";

/**
 * Tarifas del hotel (docs/specs/hospedaje-completo B2, B3):
 *   - temporadas: ajuste % sobre el precio de cada noche del rango y mínimo
 *     de noches si la llegada cae en él; para todas las habitaciones o algunas;
 *   - extras: traslado, early check-in, cuna… cobrados por estadía, noche,
 *     persona o persona y noche.
 */

const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const aIso = (d) => d.toISOString().slice(0, 10);
const usuarioDe = (user) => user?.email ?? user?.id ?? null;

// ============================================
// Temporadas
// ============================================

const serializarTemporada = (t) => ({
  id: t.id,
  nombre: t.nombre,
  desde: aIso(t.desde),
  hasta: aIso(t.hasta),
  ajustePct: t.ajustePct,
  minNoches: t.minNoches,
  productoIds: t.productoIds,
  activo: t.activo
});

/** Las habitaciones elegidas deben ser de la tienda. */
async function validarProductos(tiendaId, productoIds) {
  if (!productoIds?.length) return;
  const n = await prisma.hotel_tipos_habitacion.count({ where: { tiendaId, productoId: { in: productoIds } } });
  if (n !== new Set(productoIds).size) {
    const message = "Alguna de las habitaciones elegidas no existe";
    throw new ValidationError(message, { message, body: { productoIds: [message] } });
  }
}

/**
 * Temporadas activas que tocan [desde, hasta] para una habitación (las de
 * todas las habitaciones y las que la incluyen), con fechas "YYYY-MM-DD" como
 * las compara la cotización.
 */
export async function temporadasParaEstadia(tiendaId, productoId, desde, hasta, lang = "es") {
  const filas = await prisma.hotel_temporadas.findMany({
    where: {
      tiendaId, activo: true,
      desde: { lte: aFecha(hasta) },
      hasta: { gte: aFecha(desde) },
      OR: [{ productoIds: { isEmpty: true } }, { productoIds: { has: productoId } }]
    },
    select: { nombre: true, desde: true, hasta: true, ajustePct: true, minNoches: true, traducciones: true }
  });
  return filas.map(f => {
    const { traducciones, ...t } = traducirFila(f, ["nombre"], lang);
    return { ...t, desde: aIso(t.desde), hasta: aIso(t.hasta) };
  });
}

/** Vitrina: temporadas activas que todavía no terminan (para avisar el mínimo de noches). */
export async function temporadasPublicas(tiendaId, ahora = new Date(), lang = "es") {
  const filas = await prisma.hotel_temporadas.findMany({
    where: { tiendaId, activo: true, hasta: { gte: aFecha(fechaLima(ahora)) } },
    orderBy: { desde: "asc" }
  });
  return filas.map(f => traducirFila(f, ["nombre"], lang))
    .map(t => ({ nombre: t.nombre, desde: aIso(t.desde), hasta: aIso(t.hasta), minNoches: t.minNoches, productoIds: t.productoIds }));
}

/** Admin: vigentes y futuras primero; las pasadas al final. */
export async function listarTemporadas(tiendaId) {
  const filas = await prisma.hotel_temporadas.findMany({ where: { tiendaId }, orderBy: [{ hasta: "desc" }] });
  const hoy = fechaLima(new Date());
  return filas.map(serializarTemporada)
    .sort((a, b) => (a.hasta < hoy) - (b.hasta < hoy) || a.desde.localeCompare(b.desde));
}

export async function crearTemporada(tiendaId, data, user) {
  await validarProductos(tiendaId, data.productoIds);
  const t = await prisma.hotel_temporadas.create({
    data: {
      tiendaId, nombre: data.nombre, desde: aFecha(data.desde), hasta: aFecha(data.hasta), ajustePct: data.ajustePct,
      minNoches: data.minNoches ?? null, productoIds: data.productoIds ?? [], activo: data.activo ?? true,
      usuarioRegistro: usuarioDe(user)
    }
  });
  return serializarTemporada(t);
}

export async function actualizarTemporada(tiendaId, id, data, user) {
  await validarProductos(tiendaId, data.productoIds);
  const { count } = await prisma.hotel_temporadas.updateMany({
    where: { id, tiendaId },
    data: {
      nombre: data.nombre, desde: aFecha(data.desde), hasta: aFecha(data.hasta), ajustePct: data.ajustePct,
      minNoches: data.minNoches ?? null, productoIds: data.productoIds ?? [], activo: data.activo ?? true,
      fechaActualizacion: new Date(), usuarioActualizacion: usuarioDe(user)
    }
  });
  if (count === 0) throw new NotFoundError("Temporada");
  return serializarTemporada(await prisma.hotel_temporadas.findUnique({ where: { id } }));
}

export async function eliminarTemporada(tiendaId, id) {
  const { count } = await prisma.hotel_temporadas.deleteMany({ where: { id, tiendaId } });
  if (count === 0) throw new NotFoundError("Temporada");
}

// ============================================
// Planes de tarifa (C5): "No reembolsable −10 %". La tarifa flexible es implícita.
// ============================================

const serializarPlan = (p) => ({
  id: p.id, nombre: p.nombre, descripcion: p.descripcion, ajustePct: p.ajustePct,
  reembolsable: p.reembolsable, activo: p.activo, orden: p.orden
});

export async function listarPlanes(tiendaId) {
  const filas = await prisma.hotel_planes.findMany({ where: { tiendaId }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  return filas.map(serializarPlan);
}

/** Vitrina: solo los activos. */
export async function planesPublicos(tiendaId, lang = "es") {
  const filas = await prisma.hotel_planes.findMany({ where: { tiendaId, activo: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  return filas.map(f => serializarPlan(traducirFila(f, ["nombre", "descripcion"], lang))).map(({ activo, orden, ...p }) => p);
}

/** Plan activo de la tienda (para la cotización); null si no existe o se pausó. */
export async function planDeTienda(tiendaId, id, lang = "es") {
  const p = await prisma.hotel_planes.findFirst({ where: { id, tiendaId, activo: true } });
  return p ? serializarPlan(traducirFila(p, ["nombre", "descripcion"], lang)) : null;
}

const datosPlan = (d) => ({
  nombre: d.nombre, descripcion: d.descripcion ?? null, ajustePct: d.ajustePct,
  reembolsable: d.reembolsable ?? false, activo: d.activo ?? true, orden: d.orden ?? 0
});

export async function crearPlan(tiendaId, data, user) {
  return serializarPlan(await prisma.hotel_planes.create({ data: { tiendaId, ...datosPlan(data), usuarioRegistro: usuarioDe(user) } }));
}

export async function actualizarPlan(tiendaId, id, data, user) {
  const { count } = await prisma.hotel_planes.updateMany({
    where: { id, tiendaId }, data: { ...datosPlan(data), fechaActualizacion: new Date(), usuarioActualizacion: usuarioDe(user) }
  });
  if (count === 0) throw new NotFoundError("Plan");
  return serializarPlan(await prisma.hotel_planes.findUnique({ where: { id } }));
}

/** Las reservas guardan una copia del plan: borrarlo no las afecta. */
export async function eliminarPlan(tiendaId, id) {
  const { count } = await prisma.hotel_planes.deleteMany({ where: { id, tiendaId } });
  if (count === 0) throw new NotFoundError("Plan");
}

// ============================================
// Extras
// ============================================

const serializarExtra = (x) => ({
  id: x.id,
  nombre: x.nombre,
  descripcion: x.descripcion,
  precio: Number(x.precio),
  cobro: x.cobro,
  datoPedido: x.datoPedido,
  activo: x.activo,
  orden: x.orden
});

/** Catálogo para la cotización (se filtra por activo ahí, para avisar si uno se desactivó). */
export async function extrasDeTienda(tiendaId, lang = "es") {
  const filas = await prisma.hotel_extras.findMany({ where: { tiendaId }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  return filas.map(f => serializarExtra(traducirFila(f, ["nombre", "descripcion", "datoPedido"], lang)));
}

/** Vitrina: solo los activos. */
export async function extrasPublicos(tiendaId, lang = "es") {
  return (await extrasDeTienda(tiendaId, lang)).filter(x => x.activo).map(({ activo, orden, ...x }) => x);
}

export const listarExtras = (tiendaId) => extrasDeTienda(tiendaId);

export async function crearExtra(tiendaId, data, user) {
  const x = await prisma.hotel_extras.create({
    data: { tiendaId, ...datosExtra(data), usuarioRegistro: usuarioDe(user) }
  });
  return serializarExtra(x);
}

export async function actualizarExtra(tiendaId, id, data, user) {
  const { count } = await prisma.hotel_extras.updateMany({
    where: { id, tiendaId },
    data: { ...datosExtra(data), fechaActualizacion: new Date(), usuarioActualizacion: usuarioDe(user) }
  });
  if (count === 0) throw new NotFoundError("Extra");
  return serializarExtra(await prisma.hotel_extras.findUnique({ where: { id } }));
}

/** Las reservas guardan una copia del extra: borrarlo no las afecta. */
export async function eliminarExtra(tiendaId, id) {
  const { count } = await prisma.hotel_extras.deleteMany({ where: { id, tiendaId } });
  if (count === 0) throw new NotFoundError("Extra");
}

const datosExtra = (d) => ({
  nombre: d.nombre,
  descripcion: d.descripcion ?? null,
  precio: d.precio,
  cobro: d.cobro,
  datoPedido: d.datoPedido ?? null,
  activo: d.activo ?? true,
  orden: d.orden ?? 0
});
