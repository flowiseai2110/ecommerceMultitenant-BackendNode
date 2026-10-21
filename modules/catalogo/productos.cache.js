import MemoryCache from "../../utils/memory-cache.js";

/**
 * Cachés en memoria del catálogo público de productos. Se extraen aquí para que
 * tanto la ruta store (que lee/escribe) como la admin (que invalida el detalle
 * tras una escritura) dependan de este módulo, en vez de que la ruta admin
 * importe de la ruta store (dependencia cruzada admin→store que existía antes).
 *
 * TTL corto (60s): el storefront tolera unos segundos de desfase; el admin
 * invalida el detalle puntualmente al editar/borrar para reflejar el cambio ya.
 * Con promociones de campaña la entrada vive `min(60 s, próximo cambio de precio)`
 * (docs/specs/campanas-descuento C3a): nunca se sirve un precio pasada su frontera.
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

/** Vida de una entrada: nunca más de `maximo` ni más allá del próximo cambio de precio. */
const vida = (maximo, ttlMs) => Math.min(maximo, ttlMs ?? maximo);

/**
 * @param {string} key - Clave del home (`${tiendaId}|${take}`).
 * @param {*} payload - Respuesta a cachear.
 * @param {number} [ttlMs] - Hasta el próximo cambio de precio (`proximoCambio − ahora`).
 */
export function setProductosHome(key, payload, ttlMs) {
  const ttl = vida(HOME_TTL_MS, ttlMs);
  if (ttl > 0) homeCache.set(key, payload, ttl);
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
 * @param {number} [ttlMs] - Hasta el próximo cambio de precio (`proximoCambio − ahora`).
 */
export function setProductoDetail(id, idioma, payload, ttlMs) {
  const ttl = vida(DETAIL_TTL_MS, ttlMs);
  if (ttl > 0) detailCache.set(id, { ...(detailCache.get(id) ?? {}), [idioma]: payload }, ttl);
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

/**
 * Limpia home y detalle de todas las tiendas: al guardar el diseño (una campaña
 * encendida o apagada cambia precios) o una edición de la plataforma.
 */
export function clear() {
  homeCache.clear();
  detailCache.clear();
}
