// Fase 0 de transmision-eventos: prueba manual de Cloudflare Stream antes de
// construir nada (ver docs/specs/transmision-eventos/plan.md y fase0.md).
// No toca la base de datos ni el resto de la API: solo habla con Cloudflare.
//
//   node scripts/stream-spike.js <comando> [args]
//
// Comandos:
//   llave                              crea una signing key (copiar id y jwk al .env)
//   crear [--sin-grabar] [--baja-latencia] [--nombre "Prueba"]
//                                      crea un live input con reproducción firmada
//   listar                             lista los live inputs de la cuenta
//   estado <inputUid>                  live input + sus videos + lifecycle (¿está en vivo?)
//   token <uid> [minutos] [--descargable]
//                                      firma un token y muestra las URLs HLS e iframe
//   probar-token <uid>                 pide el manifest sin token y con token (¿se exige la firma?)
//   cortar <inputUid>                  enabled=false: corta la transmisión en curso
//   reactivar <inputUid>               enabled=true
//   salida <inputUid> <rtmpUrl> <streamKey>   agrega una retransmisión (live output)
//   salidas <inputUid>                 lista las retransmisiones
//   descarga <videoUid>                pide el MP4 descargable y muestra su estado
//   webhook <url>                      registra el webhook de Stream (devuelve el secret)
//   escuchar [puerto]                  recibe webhooks y verifica sus firmas (default 4040)
//   borrar <inputUid>                  borra el live input
//   borrar-video <videoUid>            borra un video (grabación)
//
// Variables (.env): CF_STREAM_ACCOUNT_ID, CF_STREAM_API_TOKEN (permiso Stream:Edit),
// CF_STREAM_CUSTOMER_CODE (el <CODE> de customer-<CODE>.cloudflarestream.com),
// CF_STREAM_SIGNING_KEY_ID, CF_STREAM_SIGNING_KEY_JWK (base64, tal cual lo da `llave`),
// CF_STREAM_WEBHOOK_SECRET (de `webhook`), CF_NOTIFICATIONS_SECRET (el que pongas en
// el destino de Notifications del dashboard).

import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import { SignJWT, importJWK } from "jose";

const env = process.env;
const [, , comando, ...args] = process.argv;
const flag = (nombre) => args.includes(nombre);
const valorFlag = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const posicionales = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--nombre"));

function requerir(...nombres) {
  const faltan = nombres.filter(n => !env[n]);
  if (faltan.length) {
    console.error(`❌ Faltan en el .env: ${faltan.join(", ")}`);
    process.exit(1);
  }
}

function requerirArg(valor, uso) {
  if (!valor) {
    console.error(`Uso: node scripts/stream-spike.js ${uso}`);
    process.exit(1);
  }
  return valor;
}

async function cf(metodo, ruta, body) {
  requerir("CF_STREAM_ACCOUNT_ID", "CF_STREAM_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_STREAM_ACCOUNT_ID}/stream${ruta}`;
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    console.error(`❌ ${metodo} ${ruta} → HTTP ${res.status}`);
    console.error(JSON.stringify(json.errors ?? json, null, 2));
    process.exit(1);
  }
  return json.result;
}

function base() {
  requerir("CF_STREAM_CUSTOMER_CODE");
  return `https://customer-${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com`;
}

const ver = (obj) => console.log(JSON.stringify(obj, null, 2));

async function firmar(uid, minutos = 15, descargable = false) {
  requerir("CF_STREAM_SIGNING_KEY_ID", "CF_STREAM_SIGNING_KEY_JWK");
  const jwk = JSON.parse(Buffer.from(env.CF_STREAM_SIGNING_KEY_JWK, "base64").toString("utf8"));
  const key = await importJWK(jwk, "RS256");
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ kid: env.CF_STREAM_SIGNING_KEY_ID, ...(descargable ? { downloadable: true } : {}) })
    .setProtectedHeader({ alg: "RS256", kid: env.CF_STREAM_SIGNING_KEY_ID })
    .setSubject(uid)
    .setNotBefore(ahora - 60)
    .setExpirationTime(ahora + minutos * 60)
    .sign(key);
}

// Webhook de Stream (videos): Webhook-Signature: time=<unix>,sig1=<hex HMAC-SHA256 de "time.body">
function verificarFirmaStream(header, cuerpo) {
  if (!env.CF_STREAM_WEBHOOK_SECRET) return "sin CF_STREAM_WEBHOOK_SECRET";
  const partes = Object.fromEntries((header ?? "").split(",").map(p => p.split("=")));
  if (!partes.time || !partes.sig1) return "sin cabecera Webhook-Signature";
  const edad = Math.abs(Date.now() / 1000 - Number(partes.time));
  const esperada = crypto.createHmac("sha256", env.CF_STREAM_WEBHOOK_SECRET).update(`${partes.time}.${cuerpo}`).digest("hex");
  const ok = esperada.length === partes.sig1.length &&
    crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(partes.sig1));
  return ok ? `✅ firma válida (hace ${Math.round(edad)} s)` : "❌ firma inválida";
}

// Notifications (live inputs): el secret del destino viaja tal cual en cf-webhook-auth
function verificarNotificacion(header) {
  if (!env.CF_NOTIFICATIONS_SECRET) return "sin CF_NOTIFICATIONS_SECRET";
  if (!header) return "sin cabecera cf-webhook-auth";
  const a = Buffer.from(header);
  const b = Buffer.from(env.CF_NOTIFICATIONS_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? "✅ secret válido" : "❌ secret inválido";
}

const comandos = {
  async llave() {
    const r = await cf("POST", "/keys");
    console.log("Agrega al .env:\n");
    console.log(`CF_STREAM_SIGNING_KEY_ID=${r.id}`);
    console.log(`CF_STREAM_SIGNING_KEY_JWK=${r.jwk}`);
  },

  async crear() {
    // recording.mode "off" no permite reproducir por HLS/DASH: "Solo en vivo" se
    // prueba grabando y borrando el video al terminar (ver fase0.md).
    const r = await cf("POST", "/live_inputs", {
      meta: { name: valorFlag("--nombre") ?? `spike ${new Date().toISOString()}`, tiendaId: "spike" },
      recording: {
        mode: "automatic",
        requireSignedURLs: true,
        timeoutSeconds: 60,
        ...(flag("--sin-grabar") ? {} : { deleteRecordingAfterDays: 30 })
      },
      preferLowLatency: flag("--baja-latencia")
    });
    ver(r);
    console.log(`\nLarix → RTMPS: ${r.rtmps?.url}${r.rtmps?.streamKey ?? ""}`);
    if (r.srt) console.log(`Larix → SRT:   ${r.srt.url}?streamid=${r.srt.streamId}&passphrase=${r.srt.passphrase}`);
    console.log(`\nSiguiente: node scripts/stream-spike.js token ${r.uid}`);
  },

  async listar() {
    const r = await cf("GET", "/live_inputs");
    for (const li of r.liveInputs ?? r) {
      console.log(`${li.uid}  ${li.meta?.name ?? ""}  enabled=${li.enabled}  ${li.modified}`);
    }
  },

  async estado() {
    const uid = requerirArg(posicionales[0], "estado <inputUid>");
    const li = await cf("GET", `/live_inputs/${uid}`);
    console.log(`live input ${uid}: enabled=${li.enabled} status=${JSON.stringify(li.status)} preferLowLatency=${li.preferLowLatency}`);
    const videos = await cf("GET", `/live_inputs/${uid}/videos`);
    for (const v of videos) {
      console.log(`  video ${v.uid}  state=${v.status?.state}  duración=${v.duration}s  creado=${v.created}`);
    }
    if (env.CF_STREAM_CUSTOMER_CODE) {
      const res = await fetch(`${base()}/${uid}/lifecycle`);
      console.log(`lifecycle (HTTP ${res.status}):`, await res.text());
    }
  },

  async token() {
    const uid = requerirArg(posicionales[0], "token <uid> [minutos] [--descargable]");
    const minutos = Number(posicionales[1] ?? 15);
    const t = await firmar(uid, minutos, flag("--descargable"));
    console.log(`Token (${minutos} min):\n${t}\n`);
    console.log(`iframe: ${base()}/${t}/iframe`);
    console.log(`HLS:    ${base()}/${t}/manifest/video.m3u8`);
    if (flag("--descargable")) console.log(`MP4:    ${base()}/${t}/downloads/default.mp4`);
  },

  async "probar-token"() {
    const uid = requerirArg(posicionales[0], "probar-token <uid>");
    const sin = await fetch(`${base()}/${uid}/manifest/video.m3u8`);
    const t = await firmar(uid, 5);
    const con = await fetch(`${base()}/${t}/manifest/video.m3u8`);
    const vencido = await fetch(`${base()}/${await firmar(uid, -1)}/manifest/video.m3u8`);
    console.log(`Sin token:      HTTP ${sin.status}   (esperado 401/403 si se exige la firma)`);
    console.log(`Con token:      HTTP ${con.status}   (esperado 200 si está en vivo o grabado)`);
    console.log(`Token vencido:  HTTP ${vencido.status}   (esperado 401/403)`);
  },

  async cortar() {
    const uid = requerirArg(posicionales[0], "cortar <inputUid>");
    await cambiarEnabled(uid, false);
  },

  async reactivar() {
    const uid = requerirArg(posicionales[0], "reactivar <inputUid>");
    await cambiarEnabled(uid, true);
  },

  async salida() {
    const [uid, url, streamKey] = posicionales;
    requerirArg(uid && url && streamKey, "salida <inputUid> <rtmpUrl> <streamKey>");
    ver(await cf("POST", `/live_inputs/${uid}/outputs`, { url, streamKey, enabled: true }));
  },

  async salidas() {
    const uid = requerirArg(posicionales[0], "salidas <inputUid>");
    ver(await cf("GET", `/live_inputs/${uid}/outputs`));
  },

  async descarga() {
    const uid = requerirArg(posicionales[0], "descarga <videoUid>");
    ver(await cf("POST", `/${uid}/downloads`));
    console.log("\nEstado actual:");
    ver(await cf("GET", `/${uid}/downloads`));
  },

  async webhook() {
    const url = requerirArg(posicionales[0], "webhook <url>");
    const r = await cf("PUT", "/webhook", { notificationUrl: url });
    ver(r);
    console.log(`\nAgrega al .env:\nCF_STREAM_WEBHOOK_SECRET=${r.secret}`);
  },

  async escuchar() {
    const puerto = Number(posicionales[0] ?? 4040);
    http.createServer((req, res) => {
      let cuerpo = "";
      req.on("data", c => (cuerpo += c));
      req.on("end", () => {
        const hora = new Date().toISOString();
        const esStream = Boolean(req.headers["webhook-signature"]);
        const verificacion = esStream
          ? verificarFirmaStream(req.headers["webhook-signature"], cuerpo)
          : verificarNotificacion(req.headers["cf-webhook-auth"]);
        console.log(`\n[${hora}] ${req.method} ${req.url}  (${esStream ? "Stream" : "Notifications"}) ${verificacion}`);
        try { ver(JSON.parse(cuerpo)); } catch { console.log(cuerpo); }
        res.writeHead(200).end("ok");
      });
    }).listen(puerto, () => {
      console.log(`Escuchando en http://localhost:${puerto}`);
      console.log(`Expónlo con: cloudflared tunnel --url http://localhost:${puerto}`);
    });
  },

  async borrar() {
    const uid = requerirArg(posicionales[0], "borrar <inputUid>");
    await cf("DELETE", `/live_inputs/${uid}`);
    console.log(`Live input ${uid} borrado`);
  },

  async "borrar-video"() {
    const uid = requerirArg(posicionales[0], "borrar-video <videoUid>");
    await cf("DELETE", `/${uid}`);
    console.log(`Video ${uid} borrado`);
  }
};

// PUT reemplaza el live input: se reenvían meta, recording y preferLowLatency para
// no perderlos (la doc solo muestra {"enabled": false}; el resultado se imprime para comprobarlo).
async function cambiarEnabled(uid, enabled) {
  const actual = await cf("GET", `/live_inputs/${uid}`);
  const r = await cf("PUT", `/live_inputs/${uid}`, {
    meta: actual.meta,
    recording: actual.recording,
    preferLowLatency: actual.preferLowLatency,
    enabled
  });
  console.log(`enabled=${r.enabled}  recording=${JSON.stringify(r.recording)}`);
  console.log(enabled ? "Reactivado." : "Cortado: mira qué ve el invitado y cuánto tarda en caerse Larix.");
}

const fn = comandos[comando];
if (!fn) {
  console.log("Comandos: " + Object.keys(comandos).join(", "));
  console.log("Detalle de cada uno al inicio de scripts/stream-spike.js");
  process.exit(comando ? 1 : 0);
}
await fn();
