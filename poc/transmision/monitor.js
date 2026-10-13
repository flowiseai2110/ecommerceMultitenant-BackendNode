// Prueba de concepto de transmisión — Paso 1: medir la estabilidad de la señal.
// Consulta un live input de Cloudflare Stream cada pocos segundos y anota cada
// conexión, corte y video nuevo. Al salir (Ctrl+C) imprime el resumen y lo
// guarda en poc/transmision/resultados/.
// No toca la base de datos ni la API: solo lee de Cloudflare.
//
//   node poc/transmision/monitor.js <inputUid> [--cada 3] [--etiqueta "srt-wifi-720p"]
//
// La etiqueta describe el escenario probado (protocolo, red, resolución,
// bitrate, keyframe) para comparar corridas en el README.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const args = process.argv.slice(2);
const valorFlag = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const inputUid = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const cadaSeg = Number(valorFlag("--cada") ?? 3);
// En vivo, statusLastSeen se actualiza cada 10–16 s (medido el 2026-10-12).
const SENAL_VIEJA_MS = 45_000;
const etiqueta = valorFlag("--etiqueta") ?? "sin-etiqueta";

if (!inputUid) {
  console.error('Uso: node poc/transmision/monitor.js <inputUid> [--cada 3] [--etiqueta "srt-wifi-720p"]');
  process.exit(1);
}
const faltan = ["CF_STREAM_ACCOUNT_ID", "CF_STREAM_API_TOKEN"].filter(n => !env[n]);
if (faltan.length) {
  console.error(`❌ Faltan en el .env: ${faltan.join(", ")}`);
  process.exit(1);
}

async function api(ruta) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_STREAM_ACCOUNT_ID}/stream${ruta}`, {
    headers: { Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}` },
    signal: AbortSignal.timeout(10_000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.errors?.map(e => e.message).join("; ") || `HTTP ${res.status}`);
  return json.result;
}

const hora = (d = new Date()) => d.toLocaleTimeString("es-PE", { hour12: false });
const seg = (ms) => `${Math.round(ms / 1000)} s`;

const inicio = Date.now();
const eventos = [];            // { en, tipo, detalle }
const cortes = [];             // { desde, hasta, ms }
const videosVistos = new Set();
let estado = null;             // "connected" | "disconnected" | ...
let desdeEstado = null;
let protocolo = null;
let fallosApi = 0;

function anotar(tipo, detalle = "") {
  const en = new Date();
  eventos.push({ en: en.toISOString(), tipo, detalle });
  console.log(`${hora(en)}  ${tipo.padEnd(12)} ${detalle}`);
}

async function tick() {
  let li, videos;
  try {
    [li, videos] = await Promise.all([api(`/live_inputs/${inputUid}`), api(`/live_inputs/${inputUid}/videos`)]);
  } catch (e) {
    fallosApi++;
    anotar("api-error", e.message);
    return;
  }

  // status.current.state se queda en "connected" aunque la señal haya muerto
  // (visto el 2026-10-12: 6 min después del último dato seguía así). Se exige además que
  // Cloudflare la haya visto hace poco. Verificar en el paso 1 cada cuánto
  // se actualiza statusLastSeen durante una transmisión real.
  const ahora = Date.now();
  const vistaHace = ahora - Date.parse(li.status?.current?.statusLastSeen ?? 0);
  const crudo = li.status?.current?.state ?? "sin-estado";
  const actual = crudo === "connected" && vistaHace > SENAL_VIEJA_MS ? "stale" : crudo;
  if (actual !== estado) {
    if (estado === "connected") cortes.push({ desde: ahora, hasta: null, ms: null });
    if (actual === "connected" && cortes.length && cortes.at(-1).hasta === null) {
      const c = cortes.at(-1);
      c.hasta = ahora;
      c.ms = ahora - c.desde;
    }
    const duro = desdeEstado ? ` (tras ${seg(ahora - desdeEstado)} en ${estado})` : "";
    anotar(actual, `${li.status?.current?.reason ?? ""} visto hace ${seg(vistaHace)}${duro}`);
    estado = actual;
    desdeEstado = ahora;
  }

  const p = li.status?.current?.ingestProtocol;
  if (p && p !== protocolo) {
    protocolo = p;
    anotar("protocolo", p);
  }

  for (const v of videos ?? []) {
    if (videosVistos.has(v.uid)) continue;
    videosVistos.add(v.uid);
    // Los videos que ya existían al arrancar no cuentan como cortes de esta corrida.
    if (Date.parse(v.created) >= inicio - 5000) {
      anotar("video-nuevo", `${v.uid} ${v.input?.width ?? "?"}x${v.input?.height ?? "?"}`);
    }
  }
}

function resumen() {
  const fin = Date.now();
  const abierto = cortes.at(-1);
  if (abierto && abierto.hasta === null) { abierto.hasta = fin; abierto.ms = fin - abierto.desde; }
  const totalCorteMs = cortes.reduce((s, c) => s + c.ms, 0);
  const videosNuevos = eventos.filter(e => e.tipo === "video-nuevo").length;
  const r = {
    etiqueta,
    inputUid,
    protocolo,
    duracion: seg(fin - inicio),
    cortes: cortes.length,
    tiempoCortado: seg(totalCorteMs),
    corteMasLargo: cortes.length ? seg(Math.max(...cortes.map(c => c.ms))) : "0 s",
    videosNuevos,
    fallosApi,
    eventos
  };
  console.log("\n──── Resumen ────");
  console.log(`Escenario:        ${r.etiqueta}`);
  console.log(`Protocolo:        ${r.protocolo ?? "sin señal"}`);
  console.log(`Duración medida:  ${r.duracion}`);
  console.log(`Cortes:           ${r.cortes} (en total ${r.tiempoCortado}, el más largo ${r.corteMasLargo})`);
  console.log(`Videos nuevos:    ${r.videosNuevos}  (un video nuevo = un corte de más de 60 s)`);

  const dir = path.join(import.meta.dirname, "resultados");
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `${new Date(inicio).toISOString().replace(/[:.]/g, "-")}-${etiqueta}.json`);
  fs.writeFileSync(archivo, JSON.stringify(r, null, 2));
  console.log(`Guardado en:      ${path.relative(process.cwd(), archivo)}`);
}

console.log(`Monitoreando ${inputUid} cada ${cadaSeg} s — escenario "${etiqueta}". Ctrl+C para terminar.\n`);
await tick();
const timer = setInterval(tick, cadaSeg * 1000);
const terminar = () => {
  clearInterval(timer);
  resumen();
  process.exit(0);
};
process.on("SIGINT", terminar);
process.on("SIGTERM", terminar);
