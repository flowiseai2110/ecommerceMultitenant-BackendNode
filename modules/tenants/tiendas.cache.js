import MemoryCache from "../../utils/memory-cache.js";

/**
 * Cachés en memoria de tiendas. Se extraen aquí para que la ruta admin y la ruta
 * store dependan de este módulo, en vez de que la admin importe de la store
 * (dependencia cruzada admin→store que existía antes).
 *
 * - adminList: listado del panel (depende de la membresía → la key incluye el
 *   userId; ver la ruta admin).
 * - store: GET /store/tiendas (lookup por slug del storefront).
 */

const ADMIN_LIST_TTL_MS = 60_000;
const STORE_TTL_MS = 60_000;

const adminListCache = new MemoryCache();
const storeCache = new MemoryCache();

/** @param {string} key @returns {*} */
export function getTiendasAdminList(key) {
  return adminListCache.get(key);
}

/** @param {string} key @param {*} payload */
export function setTiendasAdminList(key, payload) {
  adminListCache.set(key, payload, ADMIN_LIST_TTL_MS);
}

/** @param {string} key @returns {*} */
export function getTiendasStore(key) {
  return storeCache.get(key);
}

/** @param {string} key @param {*} payload */
export function setTiendasStore(key, payload) {
  storeCache.set(key, payload, STORE_TTL_MS);
}

/** Invalida solo la caché pública del storefront. */
export function invalidateTiendasStoreCache() {
  storeCache.clear();
}

/**
 * Invalida ambas cachés tras una escritura admin (create/update/delete/logo/
 * banner/diseño). Se limpian por completo: son tablas pequeñas y así no quedan
 * combinaciones de búsqueda/fields/slug obsoletas.
 */
export function invalidateTiendasCaches() {
  adminListCache.clear();
  storeCache.clear();
}
