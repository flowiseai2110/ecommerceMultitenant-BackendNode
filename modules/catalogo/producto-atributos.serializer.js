/**
 * Serializer de salida de atributos de producto para la audiencia ADMIN.
 * (Los atributos son metadatos de gestión del catálogo; no tienen endpoint store.)
 *
 * Construye el DTO campo por campo; nunca se devuelve el objeto crudo de Prisma.
 * @see docs/ARQUITECTURA.md
 */

/**
 * Atributo de producto tal como lo ve el admin (listado y detalle comparten
 * forma). Incluye campos de auditoría.
 * @param {object} row - Fila del atributo.
 * @returns {object} DTO admin de atributo.
 */
export function serializeAtributoAdmin(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    nombre: row.nombre,
    valores: row.valores,
    aplicaA: row.aplicaA,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion
  };
}
