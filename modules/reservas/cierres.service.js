import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { fechaLima } from "./tiempo.js";

/**
 * Fechas cerradas (spec R10): días en que el negocio no recibe reservas, para
 * todo el negocio (productoId null) o para un tipo de habitación.
 */

const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const aIso = (d) => d.toISOString().slice(0, 10);

const serializar = (c) => ({
  id: c.id,
  productoId: c.productoId,
  producto: c.producto?.nombre ?? null,
  fechaDesde: aIso(c.fechaDesde),
  fechaHasta: aIso(c.fechaHasta),
  motivo: c.motivo
});

/**
 * Cierres que tocan [desde, hasta] para un producto (incluye los de todo el
 * negocio). Devuelve fechas como texto "YYYY-MM-DD", que es lo que compara
 * la cotización.
 */
export async function cierresDeProducto(tiendaId, productoId, desde, hasta) {
  const filas = await prisma.cierres_fecha.findMany({
    where: {
      tiendaId,
      OR: [{ productoId: null }, { productoId }],
      fechaDesde: { lte: aFecha(hasta) },
      fechaHasta: { gte: aFecha(desde) }
    },
    select: { fechaDesde: true, fechaHasta: true }
  });
  return filas.map(c => ({ fechaDesde: aIso(c.fechaDesde), fechaHasta: aIso(c.fechaHasta) }));
}

/** Para el calendario de la vitrina: sin motivo (es interno). */
export async function cierresPublicos(tiendaId, { desde, hasta, productoId }) {
  const filas = await prisma.cierres_fecha.findMany({
    where: {
      tiendaId,
      ...(productoId ? { OR: [{ productoId: null }, { productoId }] } : {}),
      fechaDesde: { lte: aFecha(hasta) },
      fechaHasta: { gte: aFecha(desde) }
    },
    orderBy: { fechaDesde: "asc" },
    select: { productoId: true, fechaDesde: true, fechaHasta: true }
  });
  return filas.map(c => ({ productoId: c.productoId, fechaDesde: aIso(c.fechaDesde), fechaHasta: aIso(c.fechaHasta) }));
}

/** Admin: cierres vigentes y futuros. */
export async function listarCierres(tiendaId, ahora = new Date()) {
  const filas = await prisma.cierres_fecha.findMany({
    where: { tiendaId, fechaHasta: { gte: aFecha(fechaLima(ahora)) } },
    orderBy: { fechaDesde: "asc" },
    include: { producto: { select: { nombre: true } } }
  });
  return filas.map(serializar);
}

export async function crearCierre(tiendaId, { productoId, fechaDesde, fechaHasta, motivo }, user) {
  if (productoId) {
    const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true } });
    if (!producto) throw new NotFoundError("Habitación");
  }
  const cierre = await prisma.cierres_fecha.create({
    data: {
      tiendaId, productoId, fechaDesde: aFecha(fechaDesde), fechaHasta: aFecha(fechaHasta), motivo,
      usuarioRegistro: user?.email ?? user?.id ?? null
    },
    include: { producto: { select: { nombre: true } } }
  });
  return serializar(cierre);
}

export async function eliminarCierre(tiendaId, id) {
  const { count } = await prisma.cierres_fecha.deleteMany({ where: { id, tiendaId } });
  if (count === 0) throw new NotFoundError("Fecha cerrada");
}
