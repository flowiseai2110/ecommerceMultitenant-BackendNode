import { prisma } from "../../config/prisma.js";

/**
 * Lee `producto_precio_historial` (docs/specs/campanas-descuento R10.4). Solo lectura:
 * la tabla la llenan triggers de BD. Una consulta con `tiendaId` explícito y el índice
 * (tienda_id, producto_id, fecha). Las reglas viven en precio-historial.js.
 */
export const precioHistorialRepository = {
  /**
   * Filas del historial de los productos dados con fecha >= `desde` (todas si no se pasa),
   * de la más antigua a la más nueva. Con `desde`, la fila anterior a esa fecha no viene:
   * para saber si hay 30 días de historial use `primerRegistro`.
   */
  async historialDe(tiendaId, productoIds, desde = null) {
    if (!productoIds?.length) return [];
    return prisma.producto_precio_historial.findMany({
      where: { tiendaId, productoId: { in: productoIds }, ...(desde ? { fecha: { gte: desde } } : {}) },
      orderBy: [{ productoId: "asc" }, { fecha: "asc" }],
      select: {
        productoId: true, varianteId: true, precioAnterior: true,
        precioNuevo: true, motivo: true, fecha: true, usuario: true
      }
    });
  },

  /** Fecha del primer registro de cada producto: Map(productoId → Date). */
  async primerRegistro(tiendaId, productoIds) {
    if (!productoIds?.length) return new Map();
    const filas = await prisma.producto_precio_historial.groupBy({
      by: ["productoId"],
      where: { tiendaId, productoId: { in: productoIds } },
      _min: { fecha: true }
    });
    return new Map(filas.map((f) => [f.productoId, f._min.fecha]));
  }
};
