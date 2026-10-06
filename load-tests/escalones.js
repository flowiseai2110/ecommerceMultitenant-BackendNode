// Escalones de capacidad: sube la cantidad de TIENDAS ACTIVAS (10 → 25 → 50 →
// 100) con N visitas por minuto cada una, y mide la latencia en cada escalón.
// Cada request lleva la etiqueta escalon:<n>: el resumen muestra el p95 por
// escalón (la tabla de capacidad de la Fase 5 sale de ahí).
//
//   node load-tests/run.mjs escalones.js -e ESCALONES=10,25 -e VISITAS_POR_TIENDA_MIN=2 -e DURACION_ESCALON=3m
//
// Requiere sembrar al menos max(ESCALONES) tiendas (seed-carga --tiendas N).

import exec from "k6/execution";
import { cargarTiendas } from "./lib/tiendas.js";
import { visita, ENDPOINTS_STORE } from "./lib/store.js";
import { elegir } from "./lib/util.js";
import { UMBRALES, UMBRAL_STORE_MS, ESTADISTICAS, env, porEndpoint } from "./lib/config.js";

const ESCALONES = env("ESCALONES", "10,25").split(",").map(Number).filter(n => n > 0).sort((a, b) => a - b);
const VISITAS_POR_TIENDA_MIN = Number(env("VISITAS_POR_TIENDA_MIN", 2));
const DURACION_ESCALON = env("DURACION_ESCALON", "3m");
const RAMPA_S = 60;

const segundos = (d) => {
  const m = String(d).match(/^(\d+)(s|m|h)$/);
  if (!m) throw new Error(`Duración inválida "${d}" (usa 30s, 3m, 1h)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
};
const ESCALON_S = RAMPA_S + segundos(DURACION_ESCALON);
const tasa = (n) => n * VISITAS_POR_TIENDA_MIN;

export const options = {
  scenarios: {
    escalones: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1m",
      preAllocatedVUs: Math.max(10, Math.ceil(tasa(ESCALONES[0]) / 2)),
      maxVUs: Math.max(50, tasa(ESCALONES.at(-1)) * 2),
      stages: [
        ...ESCALONES.flatMap(n => [
          { target: tasa(n), duration: `${RAMPA_S}s` },
          { target: tasa(n), duration: DURACION_ESCALON }
        ]),
        { target: 0, duration: "30s" }
      ]
    }
  },
  thresholds: {
    http_req_failed: UMBRALES.http_req_failed,
    checks: UMBRALES.checks,
    ...porEndpoint(ENDPOINTS_STORE),
    // Un umbral por escalón: además de evaluar, hace que el resumen muestre su p95.
    ...Object.fromEntries(ESCALONES.map(n => [`http_req_duration{tipo:store,escalon:${n}}`, [`p(95)<${UMBRAL_STORE_MS}`]]))
  },
  summaryTrendStats: ESTADISTICAS
};

export function setup() {
  const tiendas = cargarTiendas(ESCALONES.at(-1));
  if (tiendas.length < ESCALONES.at(-1)) {
    throw new Error(`Hay ${tiendas.length} tiendas sembradas y el último escalón pide ${ESCALONES.at(-1)}: corre seed-carga --tiendas ${ESCALONES.at(-1)}`);
  }
  return { tiendas, inicio: Date.now() };
}

export default function ({ tiendas, inicio }) {
  const i = Math.min(Math.floor((Date.now() - inicio) / 1000 / ESCALON_S), ESCALONES.length - 1);
  const activas = ESCALONES[i];
  exec.vu.metrics.tags.escalon = String(activas);
  visita(elegir(tiendas.slice(0, activas)));
}
