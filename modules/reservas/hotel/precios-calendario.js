import { prisma } from "../../../config/prisma.js";
import { rangoFechas } from "../tiempo.js";
import { precioNoche } from "./cotizar.js";

/**
 * Precio de cada noche para el calendario de la tienda (docs/specs/reserva-hotel-mejoras H1).
 * Por tipo de habitación: el de una habitación con la modalidad por noche más
 * barata, con las mismas reglas que la cotización (viernes y sábado, temporadas).
 * Es una referencia: sin niños, extras, plan ni IGV del extranjero.
 */

const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const aIso = (d) => d.toISOString().slice(0, 10);

/**
 * Pura: precios de un tipo por noche; null en las noches cerradas.
 * @param {Array<{ tipo: string, precio, precioVieSab, activo: boolean }>} modalidades
 * @param {Array<{ desde: string, hasta: string, ajustePct: number, productoIds: string[] }>} temporadas - de la tienda
 * @param {Array<{ productoId: string|null, fechaDesde: string, fechaHasta: string }>} cierres - de la tienda
 * @returns {Record<string, number|null>|null} null si el tipo no se vende por noche
 */
export function preciosDelTipo(productoId, modalidades, temporadas, cierres, fechas) {
  const noche = modalidades.filter(m => m.tipo === "noche" && m.activo);
  if (!noche.length) return null;
  const suyas = temporadas.filter(t => !t.productoIds?.length || t.productoIds.includes(productoId));
  const cerrado = (f) => cierres.some(c => (!c.productoId || c.productoId === productoId) && c.fechaDesde <= f && f <= c.fechaHasta);
  return Object.fromEntries(fechas.map(f => [
    f,
    cerrado(f) ? null : Math.min(...noche.map(m => precioNoche(m, f, suyas).precio))
  ]));
}

/** @returns {Promise<Array<{ productoId: string, precios: Record<string, number|null> }>>} */
export async function preciosPorNoche(tiendaId, desde, hasta) {
  const rango = { lte: aFecha(hasta) };
  const [tipos, temporadas, cierres] = await Promise.all([
    prisma.hotel_tipos_habitacion.findMany({
      where: { tiendaId, producto: { activo: true } },
      select: { productoId: true, modalidades: { where: { activo: true, tipo: "noche" }, select: { tipo: true, precio: true, precioVieSab: true, activo: true } } }
    }),
    prisma.hotel_temporadas.findMany({
      where: { tiendaId, activo: true, desde: rango, hasta: { gte: aFecha(desde) } },
      select: { nombre: true, desde: true, hasta: true, ajustePct: true, productoIds: true }
    }),
    prisma.cierres_fecha.findMany({
      where: { tiendaId, fechaDesde: rango, fechaHasta: { gte: aFecha(desde) } },
      select: { productoId: true, fechaDesde: true, fechaHasta: true }
    })
  ]);
  const fechas = rangoFechas(desde, hasta);
  const temps = temporadas.map(t => ({ ...t, desde: aIso(t.desde), hasta: aIso(t.hasta) }));
  const cier = cierres.map(c => ({ productoId: c.productoId, fechaDesde: aIso(c.fechaDesde), fechaHasta: aIso(c.fechaHasta) }));
  return tipos
    .map(t => ({ productoId: t.productoId, precios: preciosDelTipo(t.productoId, t.modalidades, temps, cier, fechas) }))
    .filter(t => t.precios);
}
