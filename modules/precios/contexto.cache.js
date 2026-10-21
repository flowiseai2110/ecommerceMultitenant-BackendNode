import MemoryCache from "../../utils/memory-cache.js";

/**
 * Caché en memoria del contexto de precios por tienda (docs/specs/campanas-descuento,
 * impacto "Caché"). Solo para la vitrina (listado, home, ficha, asesor): cotizar
 * y crear el pedido leen siempre fresco (`conCache: false`, R5.2, CA-5.8).
 *
 * Una entrada vive `min(60 s, proximoCambio − ahora)`: nunca pasa la frontera de
 * una promoción. Se limpia al guardar el diseño de la tienda y, toda, al cambiar
 * una edición de la plataforma. En varias instancias, Redis con este mismo contrato.
 */

const TTL_MS = 60_000;
const cache = new MemoryCache({ max: 2000 });

/** @param {string} tiendaId */
export function contextoEnCache(tiendaId) {
  return cache.get(tiendaId);
}

/**
 * @param {string} tiendaId
 * @param {{ promociones: object[], proximoCambio: Date|null }} contexto
 * @param {Date} ahora
 */
export function guardarContexto(tiendaId, contexto, ahora) {
  const ttl = Math.min(TTL_MS, contexto.proximoCambio ? contexto.proximoCambio.getTime() - ahora.getTime() : TTL_MS);
  if (ttl > 0) cache.set(tiendaId, contexto, ttl);
}

/** Al guardar una campaña, una promoción o el diseño de la tienda. */
export function invalidarContexto(tiendaId) {
  cache.delete(tiendaId);
}

/** Al cambiar una edición de la plataforma (afecta a todas las tiendas con esa campaña). */
export function invalidarTodo() {
  cache.clear();
}
