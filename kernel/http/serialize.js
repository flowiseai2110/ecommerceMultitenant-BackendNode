/**
 * Helpers de serialización de salida.
 *
 * Regla de arquitectura: NUNCA se devuelve el resultado crudo de Prisma al
 * cliente. Cada módulo define serializers por audiencia (admin/store) que
 * construyen el DTO campo por campo (ver docs/ARQUITECTURA.md). Estos helpers
 * solo componen esos serializers sobre listas y respuestas paginadas; no
 * conocen ningún campo de dominio.
 */

/**
 * Aplica un serializer a cada fila de una lista.
 * @template T, R
 * @param {T[]} rows - Filas crudas (de Prisma o de una proyección).
 * @param {(row: T) => R} serializer - Serializer de una sola fila.
 * @returns {R[]} Lista de DTOs.
 */
export function serializeList(rows, serializer) {
  if (!Array.isArray(rows)) return [];
  return rows.map(serializer);
}

/**
 * Aplica un serializer al arreglo `data` de una respuesta paginada,
 * preservando `meta` intacto.
 * @template T, R
 * @param {{ data: T[], meta?: object }} result - Resultado paginado de un service/repository.
 * @param {(row: T) => R} serializer - Serializer de una sola fila.
 * @returns {{ data: R[], meta?: object }} Respuesta paginada serializada.
 */
export function serializePaginated(result, serializer) {
  return {
    data: serializeList(result?.data ?? [], serializer),
    ...(result?.meta !== undefined ? { meta: result.meta } : {})
  };
}

/**
 * Aplica un serializer a un valor que puede ser null (ej. findById que ya
 * garantizó existencia devuelve objeto; una relación opcional puede ser null).
 * @template T, R
 * @param {T|null|undefined} row - Fila cruda o ausencia.
 * @param {(row: T) => R} serializer - Serializer de una sola fila.
 * @returns {R|null} DTO o null si no hay fila.
 */
export function serializeMaybe(row, serializer) {
  return row ? serializer(row) : null;
}
