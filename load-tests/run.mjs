// Lanza un script de k6 con la configuración de load-tests/.env.local y
// guarda los resultados en load-tests/resultados/ (JSON + reporte HTML).
//
//   node load-tests/run.mjs store-visita.js [-e VAR=valor ...] [otros flags de k6]
//   npm run carga -- store-visita.js -e VISITAS_POR_MIN=30
//
// Las variables van por entorno (k6 las expone en __ENV), no como argumentos:
// así CARGA_KEY y la contraseña no quedan visibles en la lista de procesos.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const [script, ...resto] = process.argv.slice(2);
if (!script || !existsSync(join(dir, script))) {
  console.error("Uso: node load-tests/run.mjs <store-visita.js|store-checkout.js|admin.js|escalones.js> [flags de k6]");
  process.exit(1);
}

/** KEY=valor por línea; ignora vacías y comentarios. */
function leerEnv(ruta) {
  if (!existsSync(ruta)) return {};
  return Object.fromEntries(readFileSync(ruta, "utf8").split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
}

const k6 = ["C:\\Program Files\\k6\\k6.exe", "/usr/local/bin/k6", "/usr/bin/k6"].find(existsSync) ?? "k6";
const resultados = join(dir, "resultados");
mkdirSync(resultados, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const nombre = `${basename(script, ".js")}-${sello}`;

const env = {
  ...process.env,
  ...leerEnv(join(dir, ".env.local")),
  K6_WEB_DASHBOARD: "true",
  K6_WEB_DASHBOARD_EXPORT: join(resultados, `${nombre}.html`)
};
if (!env.CARGA_KEY) console.warn("⚠ Sin CARGA_KEY: las requests cuentan para el rate limit (1000 lecturas / 15 min por IP).");

const args = ["run", "--summary-export", join(resultados, `${nombre}.json`), ...resto, join(dir, script)];
console.log(`k6 ${script} → resultados/${nombre}.{json,html}`);
spawn(k6, args, { stdio: "inherit", env }).on("exit", (code) => process.exit(code ?? 1));
