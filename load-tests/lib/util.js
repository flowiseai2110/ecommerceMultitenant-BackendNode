import http from "k6/http";
import { check, sleep } from "k6";
import { PAUSA } from "./config.js";

export const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const prob = (p) => Math.random() < p;

/** Pausa de una persona leyendo la página (segundos, escalada por PAUSA). */
export const pensar = (min, max) => {
  if (PAUSA > 0) sleep((min + Math.random() * (max - min)) * PAUSA);
};

/** Query string a partir de un objeto (k6 no trae URLSearchParams). */
export const qs = (params) => Object.entries(params)
  .filter(([, v]) => v !== undefined && v !== null && v !== "")
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join("&");

/**
 * Verifica una respuesta: HTTP esperado y cuerpo con el formato estándar del
 * backend ({ status, type: "SUCCESS" }). k6 no conserva las etiquetas en la
 * respuesta, por eso el nombre del check se pasa aparte.
 * @param {object} r - Respuesta de k6.
 * @param {string} nombre - Nombre corto del endpoint (el mismo tag "name").
 * @param {number} [esperado=200]
 * @param {{ formato?: boolean }} [opciones] - formato:false para endpoints con envelope propio.
 */
export function verificar(r, nombre, esperado = 200, { formato = true } = {}) {
  const reglas = { [`${nombre} → ${esperado}`]: (x) => x.status === esperado };
  if (formato) {
    reglas[`${nombre} → SUCCESS`] = (x) => {
      try { return x.json("type") === "SUCCESS"; } catch { return false; }
    };
  }
  return check(r, reglas);
}

/**
 * Llamadas en paralelo (como el navegador al cargar una página) y verifica
 * cada una con el tag "name" de su request.
 * @param {Array} reqs - Requests en formato http.batch: [método, url, body, params].
 * @param {{ formato?: boolean }} [opciones]
 * @returns {object[]} Respuestas, en el mismo orden.
 */
export function lote(reqs, opciones) {
  const respuestas = http.batch(reqs);
  respuestas.forEach((r, i) => verificar(r, reqs[i][3].tags.name, 200, opciones));
  return respuestas;
}

/** data[] de una respuesta estándar, o [] si falló. */
export const datos = (r) => {
  try { return r.json("data") ?? []; } catch { return []; }
};
