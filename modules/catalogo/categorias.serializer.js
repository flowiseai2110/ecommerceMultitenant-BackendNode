/**
 * Serializers de salida de categorías para la audiencia STORE (storefront público).
 *
 * Construye el DTO campo por campo; los campos de auditoría (fechaRegistro,
 * usuarioRegistro, fechaActualizacion, usuarioActualizacion) NO se exponen al
 * público. El listado ya los excluía vía excludeFieldsInList, pero el detalle
 * (GET /:id) los devolvía crudos: este serializer unifica ambos contratos.
 *
 * @see docs/ARQUITECTURA.md — "Contratos en las fronteras (sin TS)".
 */

/**
 * Categoría tal como la ve el store (listado y detalle comparten forma).
 * @param {object} row - Fila de la categoría.
 * @returns {object} DTO público de categoría.
 */
export function serializeCategoriaStore(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaPadreId: row.categoriaPadreId,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    imagenUrl: row.imagenUrl,
    orden: row.orden,
    activo: row.activo
  };
}

/**
 * Categoría para la audiencia ADMIN (panel). El admin está autorizado a ver los
 * campos de gestión, incluidos los de auditoría. Se usa tanto en el listado como
 * en el detalle para dar un contrato consistente.
 * @param {object} row - Fila de la categoría.
 * @returns {object} DTO admin de categoría.
 */
export function serializeCategoriaAdmin(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaPadreId: row.categoriaPadreId,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    imagenUrl: row.imagenUrl,
    orden: row.orden,
    activo: row.activo,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion
  };
}
