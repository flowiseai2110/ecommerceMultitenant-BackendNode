/**
 * Serializer de salida de imágenes de producto para la audiencia ADMIN.
 * (En el store las imágenes viajan embebidas en el detalle/tarjeta de producto,
 * ya serializadas allí con su forma pública reducida.)
 *
 * Construye el DTO campo por campo; nunca se devuelve el objeto crudo de Prisma.
 * El admin sí ve los campos de storage (storagePath*, urlJpeg), que necesita para
 * la gestión y limpieza de archivos.
 * @see docs/ARQUITECTURA.md
 */

/**
 * Imagen de producto tal como la ve el admin (listado y detalle comparten forma).
 * @param {object} row - Fila de la imagen.
 * @returns {object} DTO admin de imagen.
 */
export function serializeImagenAdmin(row) {
  return {
    id: row.id,
    productoId: row.productoId,
    varianteId: row.varianteId,
    url: row.url,
    urlJpeg: row.urlJpeg,
    storagePath: row.storagePath,
    storagePathJpeg: row.storagePathJpeg,
    textoAlternativo: row.textoAlternativo,
    orden: row.orden,
    esPrincipal: row.esPrincipal,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion
  };
}
