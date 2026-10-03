import { jest } from "@jest/globals";
import express from "express";

// Rate limit del asesor (docs/specs/agente-ventas/spec.md, R3): rotar el
// sessionToken no debe permitir saltarse el límite por IP. Se simula el
// controller (sin LLM ni BD) y la resolución de tienda.

const prismaStub = new Proxy({}, { get: () => ({}) });
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: prismaStub, Prisma: {}, default: prismaStub }));

const responder = jest.fn((req, res) => res.status(200).json({ ok: true }));
const responderStream = jest.fn((req, res) => res.status(200).json({ ok: true }));
jest.unstable_mockModule("../agente.controller.js", () => ({
  responder,
  responderStream,
  recuperarConversacion: jest.fn((req, res) => res.status(200).json({ ok: true }))
}));

const { default: config } = await import("../../../config/index.js");
const { default: agenteRoutes } = await import("../agente.store.routes.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");

const TIENDA_A = "8f14e45f-ceea-467a-9a36-dedd4bea2543";
const TIENDA_B = "c9f0f895-fb98-4b91-8c2b-6e0f2a5b4d1e";

let server;
let baseUrl;

beforeAll(async () => {
  // Cada test usa otra IP (X-Forwarded-For) para no compartir contadores.
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use((req, res, next) => { req.tiendaId = req.get("x-test-tienda"); next(); });
  app.use("/store/agente", agenteRoutes);
  app.use(errorHandler);

  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => { responder.mockClear(); responderStream.mockClear(); });

function enviar({ ip, tienda = TIENDA_A, sessionToken, mensaje = "hola", ruta = "/mensajes" }) {
  return fetch(`${baseUrl}/store/agente${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, "x-test-tienda": tienda },
    body: JSON.stringify({ sessionToken, mensaje })
  });
}

const token = (n) => `sesion-de-prueba-${String(n).padStart(4, "0")}`;

describe("POST /store/agente/mensajes — rate limit", () => {
  it(`corta en ${config.agente.rateLimitSesionMin}/min por sesión`, async () => {
    const max = config.agente.rateLimitSesionMin;
    for (let i = 0; i < max; i++) {
      expect((await enviar({ ip: "10.0.0.1", sessionToken: token(1) })).status).toBe(200);
    }
    const res = await enviar({ ip: "10.0.0.1", sessionToken: token(1) });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("TOO_MANY_AI_REQUESTS");
  });

  it("la misma sesión en otra tienda tiene su propio contador", async () => {
    const max = config.agente.rateLimitSesionMin;
    for (let i = 0; i < max; i++) await enviar({ ip: "10.0.0.2", sessionToken: token(2) });

    expect((await enviar({ ip: "10.0.0.2", tienda: TIENDA_B, sessionToken: token(2) })).status).toBe(200);
  });

  it(`rotar el sessionToken no salta el límite de ${config.agente.rateLimitIpMin}/min por IP`, async () => {
    const max = config.agente.rateLimitIpMin;
    for (let i = 0; i < max; i++) {
      expect((await enviar({ ip: "10.0.0.3", sessionToken: token(100 + i) })).status).toBe(200);
    }
    expect((await enviar({ ip: "10.0.0.3", sessionToken: token(999) })).status).toBe(429);
  });

  it("los mensajes inválidos también cuentan para el límite por IP", async () => {
    const max = config.agente.rateLimitIpMin;
    for (let i = 0; i < max; i++) {
      expect((await enviar({ ip: "10.0.0.4", sessionToken: "x" })).status).toBe(400);
    }
    expect((await enviar({ ip: "10.0.0.4", sessionToken: token(5) })).status).toBe(429);
    expect(responder).not.toHaveBeenCalled();
  });

  it(`rechaza mensajes de más de ${config.agente.maxCaracteres} caracteres sin llegar al controller`, async () => {
    const res = await enviar({ ip: "10.0.0.5", sessionToken: token(6), mensaje: "a".repeat(config.agente.maxCaracteres + 1) });
    expect(res.status).toBe(400);
    expect(responder).not.toHaveBeenCalled();
  });

  it("/mensajes y /mensajes/stream comparten el límite por sesión", async () => {
    const max = config.agente.rateLimitSesionMin;
    for (let i = 0; i < max; i++) {
      const ruta = i % 2 === 0 ? "/mensajes" : "/mensajes/stream";
      expect((await enviar({ ip: "10.0.0.6", sessionToken: token(7), ruta })).status).toBe(200);
    }
    expect((await enviar({ ip: "10.0.0.6", sessionToken: token(7), ruta: "/mensajes/stream" })).status).toBe(429);
    expect(responderStream).toHaveBeenCalledTimes(max / 2);
  });

  it("GET /conversacion valida el sessionToken", async () => {
    const res = await fetch(`${baseUrl}/store/agente/conversacion?sessionToken=x`, {
      headers: { "X-Forwarded-For": "10.0.0.7", "x-test-tienda": TIENDA_A }
    });
    expect(res.status).toBe(400);
  });
});
