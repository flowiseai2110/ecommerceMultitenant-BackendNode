/**
 * Serializers de salida de productos para la audiencia STORE (storefront público).
 *
 * Contrato de arquitectura: la respuesta se construye campo por campo; NUNCA se
 * devuelve el resultado crudo de Prisma. Estos serializers son la barrera que
 * impide que campos internos del producto lleguen al público:
 *   precioCosto, stockAlerta, metadata, unidad y campos de auditoría
 *   (fechaRegistro, usuarioRegistro, ...) NO se exponen nunca al store.
 *
 * Los serializers de la audiencia ADMIN vivirán junto a estos cuando se extraiga
 * el módulo de catálogo (PR 4); el admin sí ve los campos de gestión.
 *
 * @see docs/ARQUITECTURA.md — "Contratos en las fronteras (sin TS)".
 */

/**
 * Imagen de producto tal como la ve el store.
 * `orden` y `esPrincipal` solo vienen en el detalle; en las tarjetas de listado
 * llegan como undefined y JSON los omite (salida idéntica a la anterior).
 * @param {object} img
 * @returns {object}
 */
function serializeImagenStore(img) {
  return {
    id: img.id,
    url: img.url,
    textoAlternativo: img.textoAlternativo,
    orden: img.orden,
    esPrincipal: img.esPrincipal
  };
}

/**
 * Variante de producto tal como la ve el store (detalle).
 * @param {object} v
 * @returns {object}
 */
function serializeVarianteStore(v) {
  return {
    id: v.id,
    nombre: v.nombre,
    sku: v.sku,
    precio: v.precio,
    stock: v.stock,
    atributos: v.atributos,
    activo: v.activo
  };
}

/**
 * Tarjeta de producto para listados públicos (GET / y GET /home).
 * `categoriaId` solo viene en el listado paginado; en /home llega undefined y
 * JSON lo omite, preservando la salida actual de cada endpoint.
 * @param {object} row - Fila proyectada del producto.
 * @returns {object} DTO público de tarjeta.
 */
export function serializeProductoCardStore(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaId: row.categoriaId,
    nombre: row.nombre,
    slug: row.slug,
    descripcionCorta: row.descripcionCorta,
    sku: row.sku,
    precioBase: row.precioBase,
    precioOferta: row.precioOferta,
    stock: row.stock,
    activo: row.activo,
    destacado: row.destacado,
    esServicio: row.esServicio,
    etiquetas: row.etiquetas,
    imagenes: Array.isArray(row.imagenes) ? row.imagenes.map(serializeImagenStore) : []
  };
}

/**
 * Detalle completo de producto para el store (GET /:id): incluye descripción
 * larga, variantes activas e imágenes ordenadas. Sigue sin exponer precioCosto,
 * stockAlerta ni metadata.
 * @param {object} row - Fila del producto con variantes/imagenes embebidas.
 * @returns {object} DTO público de detalle.
 */
export function serializeProductoDetailStore(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaId: row.categoriaId,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    descripcionCorta: row.descripcionCorta,
    sku: row.sku,
    precioBase: row.precioBase,
    precioOferta: row.precioOferta,
    stock: row.stock,
    activo: row.activo,
    destacado: row.destacado,
    esServicio: row.esServicio,
    etiquetas: row.etiquetas,
    variantes: Array.isArray(row.variantes) ? row.variantes.map(serializeVarianteStore) : [],
    imagenes: Array.isArray(row.imagenes) ? row.imagenes.map(serializeImagenStore) : []
  };
}

// ── Audiencia ADMIN ─────────────────────────────────────────────────────────
// El admin está autorizado a ver los campos de gestión (precioCosto, stockAlerta,
// metadata, unidad y auditoría). Se separan lista y detalle porque hoy tienen
// contratos distintos: la tabla del admin usa una proyección compacta y el
// detalle trae el producto completo con relaciones.

/**
 * Tarjeta de producto para el listado del admin (proyección compacta de la tabla).
 * Coincide en forma con el listSelect actual: sin precioCosto/metadata/auditoría.
 * @param {object} row - Fila proyectada del producto.
 * @returns {object} DTO admin de listado.
 */
export function serializeProductoAdminList(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaId: row.categoriaId,
    nombre: row.nombre,
    slug: row.slug,
    descripcionCorta: row.descripcionCorta,
    sku: row.sku,
    precioBase: row.precioBase,
    precioOferta: row.precioOferta,
    stock: row.stock,
    activo: row.activo,
    destacado: row.destacado,
    esServicio: row.esServicio,
    etiquetas: row.etiquetas,
    imagenes: Array.isArray(row.imagenes)
      ? row.imagenes.map(img => ({ id: img.id, url: img.url, textoAlternativo: img.textoAlternativo }))
      : []
  };
}

/**
 * Detalle completo de producto para el admin (GET /:id): todos los campos de
 * gestión, incluidos precioCosto, stockAlerta, metadata, unidad y auditoría, más
 * variantes e imágenes.
 * @param {object} row - Fila del producto con variantes/imagenes embebidas.
 * @returns {object} DTO admin de detalle.
 */
export function serializeProductoAdmin(row) {
  return {
    id: row.id,
    tiendaId: row.tiendaId,
    categoriaId: row.categoriaId,
    nombre: row.nombre,
    slug: row.slug,
    descripcion: row.descripcion,
    descripcionCorta: row.descripcionCorta,
    sku: row.sku,
    precioBase: row.precioBase,
    precioOferta: row.precioOferta,
    precioCosto: row.precioCosto,
    stock: row.stock,
    stockAlerta: row.stockAlerta,
    unidad: row.unidad,
    activo: row.activo,
    destacado: row.destacado,
    esServicio: row.esServicio,
    etiquetas: row.etiquetas,
    metadata: row.metadata,
    fechaRegistro: row.fechaRegistro,
    usuarioRegistro: row.usuarioRegistro,
    fechaActualizacion: row.fechaActualizacion,
    usuarioActualizacion: row.usuarioActualizacion,
    variantes: Array.isArray(row.variantes) ? row.variantes.map(serializeVarianteStore) : [],
    imagenes: Array.isArray(row.imagenes) ? row.imagenes.map(serializeImagenStore) : []
  };
}
