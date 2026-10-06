// Visitas al storefront: compradores que navegan portada, categorías,
// productos y búsqueda, con pausas como las de una persona.
//
//   node load-tests/run.mjs store-visita.js -e VISITAS_POR_MIN=60 -e DURACION=5m
//   node load-tests/run.mjs store-visita.js -e ETAPAS=150,300,450,600 -e DURACION=2m   (estrés)
//
// VISITAS_POR_MIN = visitas nuevas por minuto sumando todas las tiendas.
// ETAPAS = varias tasas seguidas (1 min de rampa + DURACION cada una); el
// resumen muestra el p95 de cada etapa (tag etapa:<visitas/min>).

import exec from "k6/execution";
import { cargarTiendas } from "./lib/tiendas.js";
import { visita, ENDPOINTS_STORE } from "./lib/store.js";
import { elegir } from "./lib/util.js";
import { TIENDAS, UMBRALES, UMBRAL_STORE_MS, ESTADISTICAS, env, porEndpoint } from "./lib/config.js";

const ETAPAS = env("ETAPAS", env("VISITAS_POR_MIN", "60")).split(",").map(Number).filter(n => n > 0);
const DURACION = env("DURACION", "5m");
const RAMPA_S = 60;
const segundos = (d) => {
  const m = String(d).match(/^(\d+)(s|m|h)$/);
  if (!m) throw new Error(`Duración inválida "${d}" (usa 30s, 3m, 1h)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
};
const ETAPA_S = RAMPA_S + segundos(DURACION);
const MAXIMA = Math.max(...ETAPAS);

export const options = {
  scenarios: {
    visitas: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1m",
      // Una visita dura ~30-60 s (pausas de lectura): VUs concurrentes ≈ visitas/min.
      preAllocatedVUs: Math.max(10, Math.ceil(ETAPAS[0] / 2)),
      maxVUs: Math.max(50, MAXIMA * 2),
      stages: [
        ...ETAPAS.flatMap(n => [
          { target: n, duration: `${RAMPA_S}s` },
          { target: n, duration: DURACION }
        ]),
        { target: 0, duration: "30s" }
      ]
    }
  },
  thresholds: {
    "http_req_duration{tipo:store}": UMBRALES["http_req_duration{tipo:store}"],
    http_req_failed: UMBRALES.http_req_failed,
    checks: UMBRALES.checks,
    ...porEndpoint(ENDPOINTS_STORE),
    ...(ETAPAS.length > 1
      ? Object.fromEntries(ETAPAS.map(n => [`http_req_duration{tipo:store,etapa:${n}}`, [`p(95)<${UMBRAL_STORE_MS}`]]))
      : {})
  },
  summaryTrendStats: ESTADISTICAS
};

export function setup() {
  return { tiendas: cargarTiendas(TIENDAS), inicio: Date.now() };
}

export default function ({ tiendas, inicio }) {
  if (ETAPAS.length > 1) {
    const i = Math.min(Math.floor((Date.now() - inicio) / 1000 / ETAPA_S), ETAPAS.length - 1);
    exec.vu.metrics.tags.etapa = String(ETAPAS[i]);
  }
  visita(elegir(tiendas));
}
