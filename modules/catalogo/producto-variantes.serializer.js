/**
 * Serializer de salida de variantes de producto para la audiencia ADMIN.
 * (Las variantes no se exponen por un endpoint propio del store; en el store
 * viajan embebidas dentro del detalle de producto, ya serializadas allí.)
 *
 * Construye el DTO campo por campo; nunca se devuelve el objeto crudo de Prisma.
 * @see docs/ARQUITECTURA.md
 */

/**
 * Variante de producto tal como la ve el admin (listado y detalle comparten
 * forma). Incluye campos de auditoría.
 * @param {object} row - Fila de la variante.
 * @returns {object} DTO admin de variante.
 */
export function serializeVarianteAdmin(row) {
  return {
    id: row.id,
    productoId: row.productoId,
    nombre: row.nombre,
    sku: row.sku,
    precio: row.precio,
    stock: row.stock,
    atributos: row.atributos,
    activo: row.activo,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion
  };
}
