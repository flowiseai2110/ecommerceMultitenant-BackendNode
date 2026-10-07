import crypto from "node:crypto";
import { SignJWT, importJWK } from "jose";
import config from "../../config/index.js";
import { StreamingProvider } from "./streaming-provider.js";

/**
 * Cloudflare Stream (live inputs). Datos verificados en la Fase 0
 * (docs/specs/transmision-eventos/fase0.md):
 * - recording.mode "off" no permite ver por HLS: se graba siempre y el job borra
 *   los videos al terminar ("Solo en vivo").
 * - `enabled: false` rechaza la señal: así se corta.
 * - Token de reproducción RS256 firmado aquí (sin llamar a la API), máx. 24 h.
 * - Una reconexión de más de `timeoutSeconds` crea otro video.
 */

const API = "https://api.cloudflare.com/client/v4/accounts";
const MAX_TOKEN_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

const cf = () => config.streaming.cloudflare;

function requerir(...campos) {
  const faltan = campos.filter(c => !cf()[c]);
  if (faltan.length) throw new Error(`Cloudflare Stream sin configurar: ${faltan.join(", ")} (ver config.streaming)`);
}

async function api(metodo, ruta, body) {
  requerir("accountId", "apiToken");
  const res = await fetch(`${API}/${cf().accountId}/stream${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${cf().apiToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (metodo === "DELETE" && res.status === 404) return null; // ya no existe: borrar es idempotente
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const detalle = json.errors?.map(e => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare Stream ${metodo} ${ruta}: ${detalle}`);
  }
  return json.result;
}

let llavePrivada = null;
async function llave() {
  if (!llavePrivada) {
    requerir("signingKeyId", "signingKeyJwk", "customerCode");
    const jwk = JSON.parse(Buffer.from(cf().signingKeyJwk, "base64").toString("utf8"));
    llavePrivada = await importJWK(jwk, "RS256");
  }
  return llavePrivada;
}

const iguales = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const RECORDING = { mode: "automatic", requireSignedURLs: true, timeoutSeconds: 60 };

export default class CloudflareStreamProvider extends StreamingProvider {
  get nombre() {
    return "cloudflare";
  }

  async crearEntrada({ nombre, meta, habilitada }) {
    const r = await api("POST", "/live_inputs", {
      meta: { name: nombre.slice(0, 100), ...meta },
      recording: RECORDING,
      enabled: habilitada
    });
    return {
      entradaId: r.uid,
      conexion: {
        rtmpsUrl: r.rtmps?.url ?? null,
        streamKey: r.rtmps?.streamKey ?? null,
        srtUrl: r.srt?.url ?? null,
        srtStreamId: r.srt?.streamId ?? null,
        srtPassphrase: r.srt?.passphrase ?? null
      }
    };
  }

  async habilitarEntrada(entradaId, habilitada) {
    // PUT reemplaza la entrada: se reenvían meta y recording para no perderlos.
    const actual = await api("GET", `/live_inputs/${entradaId}`);
    await api("PUT", `/live_inputs/${entradaId}`, {
      meta: actual.meta,
      recording: { ...RECORDING, ...actual.recording },
      enabled: habilitada
    });
  }

  async estadoEntrada(entradaId) {
    const r = await api("GET", `/live_inputs/${entradaId}`);
    return { senal: r.status?.current?.state === "connected" ? "conectada" : "desconectada" };
  }

  async borrarVideos(entradaId) {
    const videos = (await api("GET", `/live_inputs/${entradaId}/videos`).catch(() => [])) ?? [];
    for (const v of videos) await api("DELETE", `/${v.uid}`);
    return videos.length;
  }

  async borrarEntrada(entradaId) {
    await this.borrarVideos(entradaId);
    await api("DELETE", `/live_inputs/${entradaId}`);
  }

  async urlReproduccion(id, { expiraEn }) {
    const key = await llave();
    const ahora = Date.now();
    const exp = new Date(Math.min(expiraEn.getTime(), ahora + MAX_TOKEN_MS));
    const token = await new SignJWT({ kid: cf().signingKeyId })
      .setProtectedHeader({ alg: "RS256", kid: cf().signingKeyId })
      .setSubject(id)
      .setNotBefore(Math.floor(ahora / 1000) - 60)
      .setExpirationTime(Math.floor(exp.getTime() / 1000))
      .sign(key);
    const base = `https://customer-${cf().customerCode}.cloudflarestream.com/${token}`;
    return { iframeUrl: `${base}/iframe`, hlsUrl: `${base}/manifest/video.m3u8`, expiraEn: exp };
  }

  verificarWebhook({ tipo, headers, rawBody }) {
    const cuerpo = rawBody?.toString("utf8") ?? "";
    let payload;
    try { payload = JSON.parse(cuerpo); } catch { return null; }

    if (tipo === "notificaciones") {
      // Notifications manda el secret del destino tal cual en cf-webhook-auth.
      if (!cf().notificacionesSecret || !iguales(headers["cf-webhook-auth"] ?? "", cf().notificacionesSecret)) return null;
      const d = payload.data ?? {};
      if (!d.input_id || !d.event_type) return null;
      const senal = d.event_type === "live_input.connected" ? "conectada"
        : ["live_input.disconnected", "live_input.errored"].includes(d.event_type) ? "desconectada" : null;
      return {
        eventoId: `${d.event_type}:${d.input_id}:${d.updated_at ?? payload.ts ?? ""}`.slice(0, 120),
        tipo: d.event_type,
        entradaId: d.input_id,
        senal,
        payload
      };
    }

    // Webhook de videos: Webhook-Signature: time=<unix>,sig1=<HMAC-SHA256 de "time.cuerpo">
    if (!cf().webhookSecret) return null;
    const partes = Object.fromEntries(String(headers["webhook-signature"] ?? "").split(",").map(p => p.split("=")));
    if (!partes.time || !partes.sig1) return null;
    if (Math.abs(Date.now() / 1000 - Number(partes.time)) > 300) return null; // reenvíos viejos
    const esperada = crypto.createHmac("sha256", cf().webhookSecret).update(`${partes.time}.${cuerpo}`).digest("hex");
    if (!iguales(esperada, partes.sig1)) return null;
    const estado = payload.status?.state ?? "desconocido";
    return {
      eventoId: `video:${payload.uid}:${estado}`.slice(0, 120),
      tipo: `video.${estado}`,
      entradaId: payload.liveInput ?? null,
      payload
    };
  }
}
