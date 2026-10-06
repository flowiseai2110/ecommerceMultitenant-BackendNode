// Visitas al storefront: compradores que navegan portada, categorías,
// productos y búsqueda, con pausas como las de una persona.
//
//   node load-tests/run.mjs store-visita.js -e VISITAS_POR_MIN=60 -e DURACION=5m
//
// VISITAS_POR_MIN = visitas nuevas por minuto sumando todas las tiendas.

import { cargarTiendas } from "./lib/tiendas.js";
import { visita, ENDPOINTS_STORE } from "./lib/store.js";
import { elegir } from "./lib/util.js";
import { TIENDAS, UMBRALES, ESTADISTICAS, env, porEndpoint } from "./lib/config.js";

const VISITAS_POR_MIN = Number(env("VISITAS_POR_MIN", 60));
const DURACION = env("DURACION", "5m");

export const options = {
  scenarios: {
    visitas: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1m",
      preAllocatedVUs: Math.max(10, Math.ceil(VISITAS_POR_MIN / 2)),
      maxVUs: Math.max(50, VISITAS_POR_MIN * 2),
      stages: [
        { target: VISITAS_POR_MIN, duration: "1m" }, // calentamiento
        { target: VISITAS_POR_MIN, duration: DURACION },
        { target: 0, duration: "30s" }
      ]
    }
  },
  thresholds: {
    "http_req_duration{tipo:store}": UMBRALES["http_req_duration{tipo:store}"],
    http_req_failed: UMBRALES.http_req_failed,
    checks: UMBRALES.checks,
    ...porEndpoint(ENDPOINTS_STORE)
  },
  summaryTrendStats: ESTADISTICAS
};

export function setup() {
  return { tiendas: cargarTiendas(TIENDAS) };
}

export default function ({ tiendas }) {
  visita(elegir(tiendas));
}
