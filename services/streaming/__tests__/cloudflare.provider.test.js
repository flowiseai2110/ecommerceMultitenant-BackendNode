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

const { default: CloudflareStreamProvider } = await import("../cloudflare.provider.js");
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
  });
});
