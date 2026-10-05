// Utilidades compartidas por los escenarios de k6: URL base, datos de las
// tiendas sintéticas, peticiones etiquetadas y la IP simulada del visitante.

import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const API = `${BASE}/api/v1`;

// Hosts de producción: k6 se niega a correr contra ellos. Ampliable con
// PROD_HOSTS (separados por coma).
const HOSTS_PROHIBIDOS = ["backendnode-production", ...(__ENV.PROD_HOSTS || "").split(",")]
  .map((h) => h.trim())
  .filter(Boolean);

export function verificarDestino() {
  const host = BASE.replace(/^https?:\/\//, "").split("/")[0];
  const prohibido = HOSTS_PROHIBIDOS.find((h) => host.includes(h));
  if (prohibido) {
    throw new Error(`BASE_URL (${host}) es producción. Las pruebas de carga van contra staging.`);
  }
}

/** Lee el JSON que exporta scripts/seed-carga.mjs (lo llama cada script en su contexto init). */
export function leerTiendas(contenido) {
  const { tiendas } = JSON.parse(contenido);
  if (!tiendas?.length) throw new Error("El archivo de datos no tiene tiendas: ejecuta scripts/seed-carga.mjs.");
  return tiendas;
}

export const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

/** Pausa de "persona leyendo la página". PAUSA=0 la desactiva (útil en pruebas de humo). */
export function pausa(min, max) {
  if (__ENV.PAUSA === "0") return;
  sleep(min + Math.random() * (max - min));
}

// Con SSR_API_KEY (el mismo secreto que comparten el SSR y el backend), cada
// visita viaja con una IP distinta en X-Visitor-IP. Así el rate limit se
// comporta como con visitantes reales en vez de contar a k6 como una sola IP.
// Sin la clave, hay que subir RATE_LIMIT_READ_MAX en staging.
const SSR_KEY = __ENV.SSR_API_KEY || "";

function ipVisitante() {
  const n = exec.vu.idInTest * 100000 + exec.vu.iterationInScenario;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

function cabeceras(extra) {
  const h = { Accept: "application/json", ...extra };
  if (SSR_KEY) {
    h["X-SSR-Key"] = SSR_KEY;
    h["X-Visitor-IP"] = ipVisitante();
  }
  return h;
}

function query(params) {
  const partes = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return partes.length ? `?${partes.join("&")}` : "";
}

/**
 * GET etiquetado. `nombre` agrupa las URLs con IDs distintos en una sola fila
 * del resumen; `tipo` (store | admin) separa los umbrales de cada app.
 */
export function get(ruta, params, { nombre, tipo, token } = {}) {
  const res = http.get(`${API}${ruta}${query(params)}`, {
    headers: cabeceras(token ? { Authorization: `Bearer ${token}` } : {}),
    tags: { name: nombre || ruta, tipo }
  });
  check(res, { [`${nombre || ruta} → 200`]: (r) => r.status === 200 }, { tipo });
  return res;
}

/** `data` de una respuesta estándar del backend, o null si no es JSON válido. */
export function datos(res) {
  try {
    return res.json("data");
  } catch {
    return null;
  }
}
