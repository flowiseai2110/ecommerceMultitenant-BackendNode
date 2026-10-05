// Prueba de carga del backend (Store + Admin) con k6.
// Instrucciones completas en load-tests/README.md.
//
//   k6 run load-tests/prueba.js                         # PERFIL=humo
//   k6 run -e PERFIL=carga -e BASE_URL=https://... load-tests/prueba.js
//
// Variables (-e CLAVE=valor):
//   BASE_URL       backend de STAGING (http://localhost:3000)
//   PERFIL         humo | carga | escalones | pico (humo)
//   ESCENARIOS     store,admin (ambos); "store" para probar solo el Store
//   VUS_STORE      visitantes simultáneos del Store en el pico del perfil
//   VUS_ADMIN      usuarios simultáneos del Admin
//   DATOS          JSON del seed (data/tiendas-carga.json, relativo a este archivo)
//   SSR_API_KEY    simula una IP distinta por visita (ver lib/comun.js)
//   Admin:         ADMIN_TOKEN, o SUPABASE_URL + SUPABASE_ANON_KEY + ADMIN_EMAIL + ADMIN_PASSWORD
//   P95_STORE_MS / P95_ADMIN_MS  umbrales (300 / 500)

import http from "k6/http";
import { SharedArray } from "k6/data";
import { verificarDestino, leerTiendas, elegir } from "./lib/comun.js";
import { visitaStore, sesionAdmin } from "./lib/flujos.js";

verificarDestino();

const TIENDAS = new SharedArray("tiendas", () => leerTiendas(open(__ENV.DATOS || "./data/tiendas-carga.json")));

const PERFIL = __ENV.PERFIL || "humo";
const ESCENARIOS = (__ENV.ESCENARIOS || "store,admin").split(",").map((e) => e.trim());
const VUS_STORE = Number(__ENV.VUS_STORE || 0);
const VUS_ADMIN = Number(__ENV.VUS_ADMIN || 0);

// Cada VU del Store es un visitante que recorre la tienda (~30-60 s por visita
// con las pausas) y luego empieza otra visita. VUS_STORE = visitantes a la vez.
function etapasStore() {
  const n = (porDefecto) => VUS_STORE || porDefecto;
  switch (PERFIL) {
    case "humo":
      return { executor: "constant-vus", vus: 1, duration: "1m" };
    case "carga":
      return {
        executor: "ramping-vus",
        stages: [
          { duration: "2m", target: n(30) },
          { duration: "6m", target: n(30) },
          { duration: "1m", target: 0 }
        ]
      };
    case "escalones": {
      // Sube por escalones hasta VUS_STORE para ver en qué punto se rompe el p95.
      const tope = n(150);
      const pasos = [0.1, 0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(tope * f)));
      return {
        executor: "ramping-vus",
        stages: pasos.flatMap((target) => [
          { duration: "1m", target },
          { duration: "3m", target }
        ]).concat([{ duration: "1m", target: 0 }])
      };
    }
    case "pico":
      return {
        executor: "ramping-vus",
        stages: [
          { duration: "30s", target: n(200) },
          { duration: "2m", target: n(200) },
          { duration: "30s", target: 0 }
        ]
      };
    default:
      throw new Error(`PERFIL desconocido: ${PERFIL} (humo | carga | escalones | pico)`);
  }
}

function etapasAdmin() {
  const duraciones = { humo: "1m", carga: "9m", escalones: "21m", pico: "3m" };
  return {
    executor: "constant-vus",
    vus: VUS_ADMIN || (PERFIL === "humo" ? 1 : 5),
    duration: duraciones[PERFIL] || "1m"
  };
}

const scenarios = {};
if (ESCENARIOS.includes("store")) {
  const etapas = etapasStore();
  scenarios.store = { ...etapas, exec: "store", ...(etapas.executor === "ramping-vus" && { gracefulRampDown: "30s" }) };
}
if (ESCENARIOS.includes("admin")) scenarios.admin = { ...etapasAdmin(), exec: "admin" };

const P95_STORE = Number(__ENV.P95_STORE_MS || 300);
const P95_ADMIN = Number(__ENV.P95_ADMIN_MS || 500);

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    ...(scenarios.store && { "http_req_duration{tipo:store}": [`p(95)<${P95_STORE}`, `p(99)<${P95_STORE * 3}`] }),
    ...(scenarios.admin && { "http_req_duration{tipo:admin}": [`p(95)<${P95_ADMIN}`, `p(99)<${P95_ADMIN * 3}`] })
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"]
};

/** Token del Admin: ADMIN_TOKEN directo, o login con email/contraseña en Supabase Auth. */
export function setup() {
  if (!scenarios.admin) return {};
  if (__ENV.ADMIN_TOKEN) return { token: __ENV.ADMIN_TOKEN };

  const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = __ENV;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "El escenario admin necesita ADMIN_TOKEN o SUPABASE_URL + SUPABASE_ANON_KEY + ADMIN_EMAIL + ADMIN_PASSWORD. " +
      "Para probar solo el Store: -e ESCENARIOS=store"
    );
  }
  const res = http.post(
    `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, tags: { name: "login supabase" } }
  );
  if (res.status !== 200) throw new Error(`Login en Supabase falló (${res.status}): ${res.body}`);
  // El token dura 1 h por defecto en Supabase: suficiente para cualquier perfil.
  return { token: res.json("access_token") };
}

export function store() {
  visitaStore(elegir(TIENDAS));
}

export function admin(data) {
  sesionAdmin(elegir(TIENDAS), data.token);
}
