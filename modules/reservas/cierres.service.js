import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { fechaLima, instanteLima, sumarDias } from "./tiempo.js";

/** Reservas de local que retienen la fecha (alquiler-locales R2.7). */
const EN_CURSO_LOCAL = ["solicitada", "aceptada", "pago_en_revision", "confirmada", "suspendida"];

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

export async function crearCierre(tiendaId, { productoId, fechaDesde, fechaHasta, motivo }, user, ahora = new Date()) {
  if (productoId) {
    const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true } });
    if (!producto) throw new NotFoundError("Habitación");
  }
  await validarCierreSinReservasLocales(tiendaId, { productoId, fechaDesde, fechaHasta }, ahora);
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

/**
 * Locales (alquiler-locales R2.7, CE-05): no se cierra una fecha con eventos
 * en curso. Responde 409 con la lista para reprogramarlos o cancelarlos antes.
 * En hotel y tours el cierre solo afecta reservas nuevas (no hay reservas de
 * tipo local), así que la consulta no encuentra nada.
 */
async function validarCierreSinReservasLocales(tiendaId, { productoId, fechaDesde, fechaHasta }, ahora) {
  const afectadas = await prisma.pedidos.findMany({
    where: {
      tiendaId, tipo: "local", estado: { in: EN_CURSO_LOCAL },
      reserva: {
        ...(productoId ? { productoId } : {}),
        fin: { gt: ahora },
        inicio: { gte: instanteLima(fechaDesde), lt: instanteLima(sumarDias(fechaHasta, 1)) }
      }
    },
    orderBy: { fechaServicio: "asc" },
    select: { id: true, numeroPedido: true, clienteNombre: true, estado: true, reserva: { select: { inicio: true } } }
  });
  if (!afectadas.length) return;
  const message = `Hay ${afectadas.length} ${afectadas.length === 1 ? "evento" : "eventos"} en esas fechas. Reprográmalos o cancélalos antes de cerrar.`;
  throw new ConflictError(message, {
    message, motivo: "CAMBIO_CON_RESERVAS",
    reservas: afectadas.map(p => ({ pedidoId: p.id, codigo: p.numeroPedido, cliente: p.clienteNombre, estado: p.estado, fecha: fechaLima(p.reserva.inicio) }))
  });
}
