import MemoryCache from "../../utils/memory-cache.js";

/**
 * Cachés en memoria del catálogo público de productos. Se extraen aquí para que
 * tanto la ruta store (que lee/escribe) como la admin (que invalida el detalle
 * tras una escritura) dependan de este módulo, en vez de que la ruta admin
 * importe de la ruta store (dependencia cruzada admin→store que existía antes).
 *
 * TTL corto (60s): el storefront tolera unos segundos de desfase; el admin
 * invalida el detalle puntualmente al editar/borrar para reflejar el cambio ya.
 *
 * En despliegues multi-instancia, reemplazar MemoryCache por Redis manteniendo
 * este mismo contrato de funciones.
 */

const HOME_TTL_MS = 60_000;
const DETAIL_TTL_MS = 60_000;

const homeCache = new MemoryCache();
const detailCache = new MemoryCache();

/**
 * @param {string} key - Clave del home (`${tiendaId}|${take}`).
 * @returns {*} Payload cacheado o undefined/null si no hay.
 */
export function getProductosHome(key) {
  return homeCache.get(key);
}

/**
 * @param {string} key - Clave del home (`${tiendaId}|${take}`).
 * @param {*} payload - Respuesta a cachear.
 */
export function setProductosHome(key, payload) {
  homeCache.set(key, payload, HOME_TTL_MS);
}

/**
 * El detalle se guarda por idioma bajo el id del producto ({ es: …, qu: … }):
 * así invalidar un producto limpia todos sus idiomas (docs/specs/idiomas).
 * @param {string} id - ID del producto.
 * @param {string} idioma - código del idioma de la petición.
 * @returns {*} Payload cacheado del detalle o undefined si no hay.
 */
export function getProductoDetail(id, idioma) {
  return detailCache.get(id)?.[idioma];
}

/**
 * @param {string} id - ID del producto.
 * @param {string} idioma - código del idioma de la petición.
 * @param {*} payload - Respuesta del detalle a cachear.
 */
export function setProductoDetail(id, idioma, payload) {
  detailCache.set(id, { ...(detailCache.get(id) ?? {}), [idioma]: payload }, DETAIL_TTL_MS);
}

/** Limpia el home de todas las tiendas (p. ej. al guardar una traducción de un producto). */
export function invalidateProductosHome() {
  homeCache.clear();
}

/**
 * Invalida el detalle cacheado de un producto. La ruta admin la llama tras una
 * escritura exitosa (PUT/DELETE /:id) para que el storefront refleje el cambio.
 * @param {string} id - ID del producto.
 */
export function invalidateProductoDetailCache(id) {
  detailCache.delete(id);
}
