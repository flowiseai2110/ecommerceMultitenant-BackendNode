/**
 * Serializers de salida de marcas. El store no ve auditoría; el admin sí.
 * @see docs/ARQUITECTURA.md — "Contratos en las fronteras (sin TS)".
 */

/**
 * Marca tal como la ve el store (listado de filtros, tarjeta y detalle de producto).
 * @param {object | null | undefined} row
 * @returns {{ id: string, nombre: string, slug: string, logoUrl: string | null } | null}
 */
export function serializeMarcaStore(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    slug: row.slug,
    logoUrl: row.logoUrl ?? null
  };
}

/**
 * Marca para el panel (listado y detalle comparten forma).
 * @param {object} row
 * @returns {object}
 */
export function serializeMarcaAdmin(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    nombre: row.nombre,
    slug: row.slug,
    logoUrl: row.logoUrl ?? null,
    orden: row.orden,
    activo: row.activo,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion
  };
}
