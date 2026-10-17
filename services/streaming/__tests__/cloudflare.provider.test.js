import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { exportJWK, generateKeyPair, jwtVerify } from "jose";

// Firma de webhooks y token de reproducción de Cloudflare Stream, sin red.
// Formatos verificados en la Fase 0 (docs/specs/transmision-eventos/fase0.md).
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
process.env.CF_STREAM_CUSTOMER_CODE = "abc123";
process.env.CF_STREAM_SIGNING_KEY_ID = "kid-prueba";
process.env.CF_STREAM_SIGNING_KEY_JWK = Buffer.from(JSON.stringify(await exportJWK(privateKey))).toString("base64");
process.env.CF_STREAM_WEBHOOK_SECRET = "secreto-webhook";
process.env.CF_NOTIFICATIONS_SECRET = "secreto-notificaciones";
process.env.CF_STREAM_ACCOUNT_ID = "cuenta-1";
process.env.CF_STREAM_API_TOKEN = "token-1";
delete process.env.CF_STREAM_TIMEOUT_SEG;
delete process.env.CF_STREAM_ALLOWED_ORIGINS;

const { default: CloudflareStreamProvider, origenesPermitidos, segundosDePausa } = await import("../cloudflare.provider.js");
const { LimiteApiError } = await import("../streaming-provider.js");
const cf = new CloudflareStreamProvider();

const firmar = (cuerpo, time = Math.floor(Date.now() / 1000), secreto = "secreto-webhook") =>
  `time=${time},sig1=${crypto.createHmac("sha256", secreto).update(`${time}.${cuerpo}`).digest("hex")}`;

describe("verificarWebhook — videos (Webhook-Signature)", () => {
  const cuerpo = JSON.stringify({ uid: "vid-1", liveInput: "in-1", status: { state: "ready" } });

  it("acepta la firma correcta y normaliza el evento", () => {
    const r = cf.verificarWebhook({ tipo: "videos", headers: { "webhook-signature": firmar(cuerpo) }, rawBody: Buffer.from(cuerpo) });
    expect(r).toMatchObject({ eventoId: "video:vid-1:ready", tipo: "video.ready", entradaId: "in-1" });
  });

  it("rechaza otro secreto, un cuerpo alterado o una firma vieja", () => {
    const headers = (h) => ({ "webhook-signature": h });
    expect(cf.verificarWebhook({ tipo: "videos", headers: headers(firmar(cuerpo, undefined, "otro")), rawBody: Buffer.from(cuerpo) })).toBeNull();
    expect(cf.verificarWebhook({ tipo: "videos", headers: headers(firmar(cuerpo)), rawBody: Buffer.from(cuerpo + " ") })).toBeNull();
    const vieja = Math.floor(Date.now() / 1000) - 600;
    expect(cf.verificarWebhook({ tipo: "videos", headers: headers(firmar(cuerpo, vieja)), rawBody: Buffer.from(cuerpo) })).toBeNull();
    expect(cf.verificarWebhook({ tipo: "videos", headers: {}, rawBody: Buffer.from(cuerpo) })).toBeNull();
  });
});

describe("verificarWebhook — Notifications (cf-webhook-auth)", () => {
  const aviso = (event_type) => Buffer.from(JSON.stringify({
    data: { notification_name: "Stream Live Input", input_id: "in-1", event_type, updated_at: "2026-10-17T21:05:00Z" }
  }));

  it("traduce conectado / desconectado / error a la señal", () => {
    const headers = { "cf-webhook-auth": "secreto-notificaciones" };
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers, rawBody: aviso("live_input.connected") }))
      .toMatchObject({ entradaId: "in-1", senal: "conectada", eventoId: "live_input.connected:in-1:2026-10-17T21:05:00Z" });
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers, rawBody: aviso("live_input.disconnected") }).senal).toBe("desconectada");
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers, rawBody: aviso("live_input.errored") }).senal).toBe("desconectada");
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers, rawBody: aviso("live_input.connected") }).error).toBeNull();
  });

  it("errored trae el código del problema (A2)", () => {
    const cuerpo = Buffer.from(JSON.stringify({
      data: {
        input_id: "in-1", event_type: "live_input.errored", updated_at: "2026-10-17T21:06:00Z",
        live_input_errored: { error: { code: "ERR_GOP_OUT_OF_RANGE", message: "Keyframe interval out of range" }, video_codec: "h264", audio_codec: "aac" }
      }
    }));
    const r = cf.verificarWebhook({ tipo: "notificaciones", headers: { "cf-webhook-auth": "secreto-notificaciones" }, rawBody: cuerpo });
    expect(r.error).toEqual({ codigo: "ERR_GOP_OUT_OF_RANGE", mensaje: "Keyframe interval out of range" });
    // Sin detalle: se trata como un problema genérico.
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers: { "cf-webhook-auth": "secreto-notificaciones" }, rawBody: aviso("live_input.errored") }).error)
      .toEqual({ codigo: "ERR_UNHEALTHY", mensaje: null });
  });

  it("rechaza un secret distinto o ausente", () => {
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers: { "cf-webhook-auth": "x" }, rawBody: aviso("live_input.connected") })).toBeNull();
    expect(cf.verificarWebhook({ tipo: "notificaciones", headers: {}, rawBody: aviso("live_input.connected") })).toBeNull();
  });
});

describe("urlReproduccion", () => {
  it("firma RS256 con el kid, para esa entrada, y nunca más de 24 h", async () => {
    const r = await cf.urlReproduccion("in-1", { expiraEn: new Date(Date.now() + 72 * 3600 * 1000) });
    expect(r.iframeUrl).toMatch(/^https:\/\/customer-abc123\.cloudflarestream\.com\/ey[^/]+\/iframe$/);
    const token = r.iframeUrl.split("/")[3];
    const { payload, protectedHeader } = await jwtVerify(token, publicKey);
    expect(protectedHeader).toMatchObject({ alg: "RS256", kid: "kid-prueba" });
    expect(payload.sub).toBe("in-1");
    expect(payload.exp - Date.now() / 1000).toBeLessThanOrEqual(24 * 3600 + 1);
    expect(r.estadoUrl).toBeNull();
  });

  it("en vivo: autoplay silenciado y estadoUrl (/lifecycle) con el mismo token", async () => {
    const r = await cf.urlReproduccion("in-1", { expiraEn: new Date(Date.now() + 3600 * 1000), enVivo: true });
    expect(r.iframeUrl).toMatch(/\/iframe\?autoplay=true&muted=true$/);
    const token = r.iframeUrl.split("/")[3];
    expect(r.estadoUrl).toBe(`https://customer-abc123.cloudflarestream.com/${token}/lifecycle`);
  });
});

describe("origenesPermitidos (allowedOrigins)", () => {
  const base = (extra = {}) => ({
    streaming: { cloudflare: { allowedOrigins: [] } },
    platform: { baseDomain: "ecompyme.com", storefrontUrl: "https://ecompyme.com" },
    frontendUrl: "https://admin.ecompyme.com",
    ...extra
  });

  it("las tiendas en *.<dominio> y el admin, sin repetir", () => {
    expect(origenesPermitidos(base())).toEqual(["ecompyme.com", "*.ecompyme.com", "admin.ecompyme.com"]);
  });

  it("en local queda vacío (sin restricción) y la variable manda si está", () => {
    expect(origenesPermitidos(base({ platform: { baseDomain: null, storefrontUrl: "http://localhost:4200" }, frontendUrl: "http://localhost:4201" }))).toEqual([]);
    expect(origenesPermitidos(base({ streaming: { cloudflare: { allowedOrigins: ["tienda.pe"] } } }))).toEqual(["tienda.pe"]);
  });
});

describe("llamadas a la API", () => {
  const respuesta = (status, result, headers = {}) => new Response(JSON.stringify({ success: status < 400, result, errors: [] }), { status, headers });
  const original = global.fetch;
  afterAll(() => { global.fetch = original; });

  it("crearEntrada graba con firma y timeoutSeconds 0 (el valor de Cloudflare)", async () => {
    global.fetch = jest.fn(async () => respuesta(200, { uid: "in-1", rtmps: { url: "rtmps://x/", streamKey: "k" }, srt: {} }));
    await cf.crearEntrada({ nombre: "Cumple", meta: { tiendaId: "t1" }, habilitada: false });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.recording).toEqual({ mode: "automatic", requireSignedURLs: true, timeoutSeconds: 0 });
    expect(body.preferLowLatency).toBe(false);
  });

  it("con los parámetros de la plataforma: LL-HLS y el timeout pedidos", async () => {
    global.fetch = jest.fn(async () => respuesta(200, { uid: "in-1", rtmps: {}, srt: {} }));
    await cf.crearEntrada({ nombre: "Cumple", meta: {}, habilitada: false, ajustes: { bajaLatencia: true, timeoutSegundos: 60 } });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.preferLowLatency).toBe(true);
    expect(body.recording.timeoutSeconds).toBe(60);
  });

  it("el PUT de cortar conserva LL-HLS y el timeout de la entrada (si no, se apagarían)", async () => {
    const actual = { uid: "in-1", meta: { name: "x" }, recording: { mode: "automatic", requireSignedURLs: true, timeoutSeconds: 60 }, preferLowLatency: true };
    global.fetch = jest.fn(async (_url, opts) => respuesta(200, opts.method === "GET" ? actual : {}));
    await cf.habilitarEntrada("in-1", false, { urgente: true });
    const put = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(put).toMatchObject({ enabled: false, preferLowLatency: true, recording: { timeoutSeconds: 60 }, meta: { name: "x" } });
  });

  it("al habilitar aplica los parámetros vigentes", async () => {
    const actual = { uid: "in-1", meta: {}, recording: { timeoutSeconds: 60 }, preferLowLatency: true };
    global.fetch = jest.fn(async (_url, opts) => respuesta(200, opts.method === "GET" ? actual : {}));
    await cf.habilitarEntrada("in-1", true, { ajustes: { bajaLatencia: false, timeoutSegundos: 0 } });
    const put = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(put).toMatchObject({ enabled: true, preferLowLatency: false, recording: { timeoutSeconds: 0 } });
  });

  it("usoAlmacenamiento normaliza storage-usage", async () => {
    global.fetch = jest.fn(async () => respuesta(200, { totalStorageMinutes: 850.5, totalStorageMinutesLimit: 1000, videoCount: 3 }));
    expect(await cf.usoAlmacenamiento()).toEqual({ usadoMin: 850.5, limiteMin: 1000 });
    expect(global.fetch.mock.calls[0][0]).toBe("https://api.cloudflare.com/client/v4/accounts/cuenta-1/stream/storage-usage");
  });

  it("lee la pausa del encabezado Ratelimit o Retry-After, con tope de 5 min", () => {
    expect(segundosDePausa(new Headers({ ratelimit: '"default";r=0;t=42' }))).toBe(42);
    expect(segundosDePausa(new Headers({ "retry-after": "7" }))).toBe(7);
    expect(segundosDePausa(new Headers({ ratelimit: '"default";r=0;t=9999' }))).toBe(300);
    expect(segundosDePausa(new Headers())).toBe(300);
  });

  // Va al final: la pausa queda activa para el resto del archivo.
  it("ante un 429 deja de llamar hasta que se reinicia la ventana, salvo lo urgente (el corte)", async () => {
    global.fetch = jest.fn(async () => respuesta(429, null, { ratelimit: '"default";r=0;t=60' }));
    await expect(cf.estadoEntrada("in-1")).rejects.toBeInstanceOf(LimiteApiError);
    const pausa = cf.consumoApi().pausadaHasta;
    expect(pausa.getTime() - Date.now()).toBeGreaterThan(55_000);

    global.fetch = jest.fn(async () => respuesta(200, { uid: "in-1", meta: {}, recording: {}, status: { current: { state: "connected" } } }));
    await expect(cf.estadoEntrada("in-1")).rejects.toBeInstanceOf(LimiteApiError);
    expect(global.fetch).not.toHaveBeenCalled();

    await cf.habilitarEntrada("in-1", false, { urgente: true });
    expect(global.fetch).toHaveBeenCalledTimes(2); // GET + PUT
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).enabled).toBe(false);
  });
});
