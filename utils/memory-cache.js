import { LRUCache } from "lru-cache";

/**
 * Cache temporal en memoria del proceso Node, acotada por cantidad de entradas
 * (max) + expiración por TTL. Envuelve lru-cache (estándar de facto en el
 * ecosistema Node — lo usa el propio npm como dependencia interna) en vez de
 * un Map con expiración perezosa: con un Map plano, una entrada vencida que
 * nadie vuelve a pedir se queda en memoria indefinidamente (acotado por el
 * tamaño del catálogo, no infinito, pero no es un límite real). Con "max", al
 * llegar al tope se descarta la entrada usada menos recientemente, sin
 * depender de que se vuelva a leer esa key para liberarla.
 *
 * Pensada para un solo proceso backend (sin Redis) — no se comparte entre instancias.
 */
class MemoryCache {
  constructor({ max = 500 } = {}) {
    this.store = new LRUCache({ max });
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value, ttlMs) {
    this.store.set(key, value, { ttl: ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export default MemoryCache;
