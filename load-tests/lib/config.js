// Configuración común de las pruebas de carga. Todo se puede cambiar con
// variables de entorno (k6 -e VAR=valor, o load-tests/.env.local vía run.mjs).

const env = (nombre, porDefecto) => (__ENV[nombre] !== undefined && __ENV[nombre] !== "" ? __ENV[nombre] : porDefecto);

export const BASE_URL = `${env("BASE_URL", "https://ecommercemultitenant-backendnode-production-2ba3.up.railway.app").replace(/\/+$/, "")}/api/v1`;
export const PREFIJO = env("PREFIJO", "carga");
export const TIENDAS = Number(env("TIENDAS", 25));
// Multiplica las pausas "humanas" entre páginas (0 = sin pausas, solo para depurar).
export const PAUSA = Number(env("PAUSA", 1));

// El edge de Railway es un CDN: cachea las respuestas "Cache-Control: public"
// del catálogo (x-cache: HIT) y esas requests no llegan al backend.
//   CDN=si  → como un comprador real (mide la experiencia, con caché).
//   CDN=no  → agrega _k6=<aleatorio> a cada URL para forzar MISS: mide la
//             capacidad del backend y la BD. Las cachés en memoria del backend
//             no usan ese parámetro en su clave, así que siguen funcionando.
export const SIN_CDN = env("CDN", "si") === "no";

export const SUPABASE_URL = env("SUPABASE_URL", "");
export const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY", "");
export const ADMIN_EMAIL = env("K6_ADMIN_EMAIL", "");
export const ADMIN_PASSWORD = env("K6_ADMIN_PASSWORD", "");

// X-Carga-Key salta los rate limits del backend (CARGA_KEY en Railway): k6
// sale desde una sola IP y sin esto mediría errores 429, no capacidad.
const CARGA_KEY = env("CARGA_KEY", "");
export const HEADERS = { Accept: "application/json", ...(CARGA_KEY ? { "X-Carga-Key": CARGA_KEY } : {}) };

export { env };

// Objetivos del plan: Store p95 < 300 ms, Admin p95 < 500 ms, errores < 1 %.
// El checkout escribe en transacción (stock, cliente, historial): objetivo aparte.
// OJO: medido desde Lima, una respuesta que no sale del CDN ya cuesta ~270 ms
// solo de red (Lima → edge São Paulo → servidor en EE. UU., medido el
// 2026-10-05): ajustables con UMBRAL_STORE_MS / UMBRAL_ADMIN_MS / UMBRAL_CHECKOUT_MS.
export const UMBRAL_STORE_MS = Number(env("UMBRAL_STORE_MS", 300));
export const UMBRALES = {
  "http_req_duration{tipo:store}": [`p(95)<${UMBRAL_STORE_MS}`],
  "http_req_duration{tipo:admin}": [`p(95)<${Number(env("UMBRAL_ADMIN_MS", 500))}`],
  "http_req_duration{tipo:checkout}": [`p(95)<${Number(env("UMBRAL_CHECKOUT_MS", 800))}`],
  http_req_failed: ["rate<0.01"],
  checks: ["rate>0.99"]
};

export const ESTADISTICAS = ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"];

/**
 * Submétricas por endpoint (tag "name") para que el resumen muestre el p95 de
 * cada uno. El umbral es solo informativo (nunca falla): el que evalúa es el
 * de tipo:store / tipo:admin.
 * @param {string[]} nombres
 */
export const porEndpoint = (nombres) =>
  Object.fromEntries(nombres.map(n => [`http_req_duration{name:${n}}`, ["max>=0"]]));
