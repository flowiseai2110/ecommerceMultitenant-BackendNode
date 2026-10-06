import { jest } from "@jest/globals";
import express from "express";

// IP real del visitante para rate limiting (Fase 0 de pruebas de carga).
// Simula los dos caminos del storefront: navegador vía proxy (X-Forwarded-For)
// y SSR desde Vercel (todas las requests desde la misma IP, con la del
// visitante en X-Visitor-IP firmada con X-SSR-Key).

jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));

const { default: config } = await import("../../../config/index.js");
const { crearLimitador } = await import("../rate-limit.js");
const { resolveClientIp } = await import("../client-ip.js");
const { requireMetricsToken } = await import("../../../middlewares/metrics-auth.middleware.js");

const SECRETO = "secreto-ssr-de-prueba";
const MAX = 2;
const IP_VERCEL = "76.76.21.21";

let server;
let baseUrl;

beforeAll(async () => {
  config.ssr.apiKey = SECRETO;
  config.metrics.token = "token-metricas";
  config.carga.key = "clave-carga";

  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", (req, res) => res.json(resolveClientIp(req)));
  app.get("/limitado", crearLimitador({ windowMs: 60_000, max: MAX, code: "TOO_MANY_REQUESTS", message: "x" }),
    (req, res) => res.json({ ok: true }));
  app.get("/con-skip", crearLimitador({ windowMs: 60_000, max: 1, code: "X", message: "x", skip: (req) => req.get("x-saltar") === "1" }),
    (req, res) => res.json({ ok: true }));
  app.use("/metrics", requireMetricsToken);
  app.get("/metrics", (req, res) => res.json({ ok: true }));

  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

const get = (ruta, headers = {}) => fetch(`${baseUrl}${ruta}`, { headers });
const desdeSsr = (visitante, clave = SECRETO) =>
  ({ "X-Forwarded-For": IP_VERCEL, "X-SSR-Key": clave, "X-Visitor-IP": visitante });

describe("resolveClientIp", () => {
  it("sin firma usa req.ip (trust proxy)", async () => {
    const r = await (await get("/ip", { "X-Forwarded-For": "200.1.1.1" })).json();
    expect(r).toEqual({ ip: "200.1.1.1", source: "proxy" });
  });

  it("SSR firmado usa la IP del visitante", async () => {
    const r = await (await get("/ip", desdeSsr("190.2.2.2"))).json();
    expect(r).toEqual({ ip: "190.2.2.2", source: "ssr" });
  });

  it("acepta IPv6 del visitante", async () => {
    const r = await (await get("/ip", desdeSsr("2800:200:e840::1"))).json();
    expect(r).toEqual({ ip: "2800:200:e840::1", source: "ssr" });
  });

  it("con clave incorrecta ignora X-Visitor-IP", async () => {
    const r = await (await get("/ip", desdeSsr("190.2.2.2", "otra-clave"))).json();
    expect(r).toEqual({ ip: IP_VERCEL, source: "proxy" });
  });

  it("ignora un X-Visitor-IP que no es una IP", async () => {
    const r = await (await get("/ip", desdeSsr("no-es-ip"))).json();
    expect(r).toEqual({ ip: IP_VERCEL, source: "proxy" });
  });

  it("sin SSR_API_KEY configurada nunca confía en X-Visitor-IP", async () => {
    config.ssr.apiKey = "";
    try {
      const r = await (await get("/ip", desdeSsr("190.2.2.2", ""))).json();
      expect(r).toEqual({ ip: IP_VERCEL, source: "proxy" });
    } finally {
      config.ssr.apiKey = SECRETO;
    }
  });
});

describe("crearLimitador por IP real", () => {
  it("dos visitantes SSR detrás de la misma IP de Vercel no comparten cupo", async () => {
    for (let i = 0; i < MAX; i++) expect((await get("/limitado", desdeSsr("181.3.3.3"))).status).toBe(200);
    expect((await get("/limitado", desdeSsr("181.3.3.3"))).status).toBe(429);
    expect((await get("/limitado", desdeSsr("181.4.4.4"))).status).toBe(200);
  });

  it("responde el 429 con el formato estándar", async () => {
    for (let i = 0; i < MAX; i++) await get("/limitado", { "X-Forwarded-For": "201.5.5.5" });
    const res = await get("/limitado", { "X-Forwarded-For": "201.5.5.5" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ status: 429, type: "ERROR", code: "TOO_MANY_REQUESTS", data: { message: "x" } });
  });
});

describe("requireMetricsToken", () => {
  it("sin token responde 404", async () => {
    expect((await get("/metrics")).status).toBe(404);
  });

  it("con token incorrecto responde 404", async () => {
    expect((await get("/metrics", { "X-Metrics-Key": "nope" })).status).toBe(404);
  });

  it("con el token correcto deja pasar", async () => {
    expect((await get("/metrics", { "X-Metrics-Key": "token-metricas" })).status).toBe(200);
  });
});

describe("bypass de pruebas de carga (X-Carga-Key)", () => {
  it("con la clave correcta no cuenta para el límite", async () => {
    const h = { "X-Forwarded-For": "202.6.6.6", "X-Carga-Key": "clave-carga" };
    for (let i = 0; i < MAX + 3; i++) expect((await get("/limitado", h)).status).toBe(200);
  });

  it("con una clave incorrecta sí cuenta", async () => {
    const h = { "X-Forwarded-For": "202.7.7.7", "X-Carga-Key": "otra" };
    for (let i = 0; i < MAX; i++) await get("/limitado", h);
    expect((await get("/limitado", h)).status).toBe(429);
  });

  it("sin CARGA_KEY configurada el bypass no existe", async () => {
    config.carga.key = "";
    try {
      const h = { "X-Forwarded-For": "202.8.8.8", "X-Carga-Key": "" };
      for (let i = 0; i < MAX; i++) await get("/limitado", h);
      expect((await get("/limitado", h)).status).toBe(429);
    } finally {
      config.carga.key = "clave-carga";
    }
  });

  it("respeta el skip propio del limitador", async () => {
    const h = { "X-Forwarded-For": "202.9.9.9", "X-Saltar": "1" };
    for (let i = 0; i < 3; i++) expect((await get("/con-skip", h)).status).toBe(200);
    expect((await get("/con-skip", { "X-Forwarded-For": "202.9.9.9" })).status).toBe(200);
    expect((await get("/con-skip", { "X-Forwarded-For": "202.9.9.9" })).status).toBe(429);
  });
});
