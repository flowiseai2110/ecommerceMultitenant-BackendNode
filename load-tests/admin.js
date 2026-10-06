// Panel de administración: dueños revisando el dashboard, sus pedidos y
// editando productos, con el usuario de pruebas (owner de las tiendas carga-*).
//
//   node load-tests/run.mjs admin.js -e SESIONES_POR_MIN=10 -e DURACION=5m

import { login, tiendasDelOwner, sesion, ENDPOINTS_ADMIN } from "./lib/admin.js";
import { elegir } from "./lib/util.js";
import { UMBRALES, ESTADISTICAS, env, porEndpoint } from "./lib/config.js";

const SESIONES_POR_MIN = Number(env("SESIONES_POR_MIN", 10));
const DURACION = env("DURACION", "5m");

export const options = {
  scenarios: {
    admin: {
      executor: "constant-arrival-rate",
      rate: SESIONES_POR_MIN,
      timeUnit: "1m",
      duration: DURACION,
      preAllocatedVUs: Math.max(5, SESIONES_POR_MIN),
      maxVUs: Math.max(20, SESIONES_POR_MIN * 3)
    }
  },
  thresholds: {
    "http_req_duration{tipo:admin}": UMBRALES["http_req_duration{tipo:admin}"],
    http_req_failed: UMBRALES.http_req_failed,
    checks: UMBRALES.checks,
    ...porEndpoint(ENDPOINTS_ADMIN)
  },
  summaryTrendStats: ESTADISTICAS
};

export function setup() {
  const token = login();
  return { token, tiendas: tiendasDelOwner(token) };
}

export default function ({ token, tiendas }) {
  sesion(token, elegir(tiendas));
}
