import MemoryCache from "./memory-cache.js";

/**
 * Caché en memoria de respuestas GET públicas del storefront, agrupada por
 * namespace (categorias, metodos-pago, envios, live, resenas).
 *
 * Por qué a nivel de respuesta y no por servicio: estos endpoints usan el
 * GenericController o handlers simples; cachear el JSON final evita tocar cada
 * servicio y cubre todas las combinaciones de query (paginación, filtros,
 * ubigeo/subtotal en cotizar) con una sola key: tienda resuelta + URL.
 *
 * Invalidación: la ruta admin de cada módulo limpia su namespace completo tras
 * una escritura exitosa (invalidarAlEscribir). Se limpia todo el namespace y no
 * solo la tienda: son tablas pequeñas y así no hace falta indexar keys por tienda.
 *
 * Igual que productos.cache.js: un solo proceso, sin Redis. Con varias
 * instancias, otra instancia puede servir datos de hasta TTL de antigüedad.
 */

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 1000;

const caches = new Map();

function cacheDe(namespace) {
  let c = caches.get(namespace);
  if (!c) {
    c = new MemoryCache({ max: MAX_ENTRIES });
    caches.set(namespace, c);
  }
  return c;
}

/**
 * Middleware que sirve desde memoria las respuestas GET 200 de un namespace.
 * Debe ir después de resolveTienda (la key usa req.tiendaId: con subdominio la
 * URL no trae la tienda).
 *
 * @param {string} namespace
 * @param {object} [opts]
 * @param {number} [opts.ttlMs] - Vida de la entrada (default 60s).
 * @param {(body: object) => number} [opts.ttlDe] - TTL según la respuesta
 *   (ej. live: no pasar de su expiraEn). Se usa el menor entre ambos.
 */
export function cacheRespuesta(namespace, { ttlMs = DEFAULT_TTL_MS, ttlDe } = {}) {
  const cache = cacheDe(namespace);

  return (req, res, next) => {
    if (req.method !== "GET") return next();

    const key = `${req.tiendaId ?? "-"}|${req.originalUrl}`;
    const hit = cache.get(key);
    if (hit) {
      if (hit.cacheControl) res.set("Cache-Control", hit.cacheControl);
      return res.status(200).json(hit.body);
    }

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        const ttl = ttlDe ? Math.min(ttlMs, ttlDe(body)) : ttlMs;
        if (ttl > 0) cache.set(key, { body, cacheControl: res.get("Cache-Control") }, ttl);
      }
      return json(body);
    };
    next();
  };
}

/** Limpia por completo los namespaces indicados. */
export function invalidarCacheStore(...namespaces) {
  for (const ns of namespaces) caches.get(ns)?.clear();
}

/**
 * Middleware para rutas que escriben: al terminar una petición no-GET con
 * status < 400, limpia los namespaces indicados.
 */
export function invalidarAlEscribir(...namespaces) {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      res.on("finish", () => {
        if (res.statusCode < 400) invalidarCacheStore(...namespaces);
      });
    }
    next();
  };
}
