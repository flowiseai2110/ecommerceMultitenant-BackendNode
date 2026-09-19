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
 * @param {string} id - ID del producto.
 * @returns {*} Payload cacheado del detalle o undefined/null si no hay.
 */
export function getProductoDetail(id) {
  return detailCache.get(id);
}

/**
 * @param {string} id - ID del producto.
 * @param {*} payload - Respuesta del detalle a cachear.
 */
export function setProductoDetail(id, payload) {
  detailCache.set(id, payload, DETAIL_TTL_MS);
}

/**
 * Invalida el detalle cacheado de un producto. La ruta admin la llama tras una
 * escritura exitosa (PUT/DELETE /:id) para que el storefront refleje el cambio.
 * @param {string} id - ID del producto.
 */
export function invalidateProductoDetailCache(id) {
  detailCache.delete(id);
}
