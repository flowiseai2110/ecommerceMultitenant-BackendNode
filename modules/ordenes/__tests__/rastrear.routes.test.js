import { jest } from "@jest/globals";
import express from "express";

// Seguimiento público en dos niveles (docs/specs/agente-ventas/spec.md, R4):
// la ruta pasa la sesión y el código al servicio, valida el código y limita
// las verificaciones fallidas por pedido (no por IP). El servicio usa la lógica
// real de rastreo.js sobre un pedido simulado.

const prismaStub = new Proxy({}, { get: () => ({}) });
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: prismaStub, Prisma: {}, default: prismaStub }));

jest.unstable_mockModule("../../../middlewares/auth.middleware.js", () => {
  const optionalAuth = (req, res, next) => {
    const userId = req.get("x-test-user");
    req.user = userId ? { id: userId } : null;
    next();
  };
  const passthrough = (req, res, next) => next();
  return { authMiddleware: passthrough, optionalAuth, requireRole: () => passthrough, default: {} };
});

const DUENO = "6f1c2c0e-5b7a-4b1e-9f0e-2d7c1a3b4c5d";
const PEDIDO = {
  numeroPedido: "PED-0007",
  estado: "enviado",
  estadoPago: "pagado",
  direccionEnvio: "Av. Siempre Viva 742",
  fechaRegistro: "2026-10-01T10:00:00Z",
  fechaConfirmado: null,
  fechaEntregado: null,
  historialEstados: [],
  detalles: [],
  clienteWhatsapp: "987654821",
  authUserId: DUENO
};

const { NotFoundError } = await import("../../../utils/errors.js");
const { nivelDeAcceso, serializarRastreo } = await import("../rastreo.js");
const rastrear = jest.fn(async (tiendaId, numero, solicitante) => {
  if (numero !== PEDIDO.numeroPedido) throw new NotFoundError("Pedido");
  return serializarRastreo(PEDIDO, nivelDeAcceso(PEDIDO, solicitante));
});
jest.unstable_mockModule("../pedidos.service.js", () => ({
  default: class { rastrear(...args) { return rastrear(...args); } }
}));

const { default: config } = await import("../../../config/index.js");
const { default: pedidosRoutes } = await import("../pedidos.store.routes.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");

const TIENDA = "8f14e45f-ceea-467a-9a36-dedd4bea2543";

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/store/pedidos", pedidosRoutes);
  app.use(errorHandler);

  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => rastrear.mockClear());

let ipSeq = 0;
function consultar({ numero = "PED-0007", verificacion, user, ip } = {}) {
  const qs = new URLSearchParams({ tiendaId: TIENDA });
  if (verificacion) qs.set("verificacion", verificacion);
  const headers = { "X-Forwarded-For": ip ?? `10.1.0.${++ipSeq}` };
  if (user) headers["x-test-user"] = user;
  return fetch(`${baseUrl}/store/pedidos/rastrear/${numero}?${qs}`, { headers });
}

describe("GET /store/pedidos/rastrear/:numero", () => {
  it("solo con el número devuelve el nivel público, sin dirección", async () => {
    const res = await consultar();
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.detalleCompleto).toBe(false);
    expect(data.puedeVerificar).toBe(true);
    expect(data).not.toHaveProperty("direccionEnvio");
  });

  it("con los 4 dígitos correctos devuelve el detalle completo", async () => {
    const { data } = await (await consultar({ verificacion: "4821" })).json();

    expect(data.detalleCompleto).toBe(true);
    expect(data.direccionEnvio).toBe("Av. Siempre Viva 742");
    expect(data).not.toHaveProperty("clienteWhatsapp");
  });

  it("el dueño con sesión ve el detalle sin verificar", async () => {
    const { data } = await (await consultar({ user: DUENO })).json();
    expect(data.detalleCompleto).toBe(true);
    expect(rastrear.mock.calls[0][2]).toEqual({ verificacion: undefined, authUserId: DUENO });
  });

  it("dígitos incorrectos: 403 VERIFICACION_INVALIDA", async () => {
    const res = await consultar({ verificacion: "0000" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("VERIFICACION_INVALIDA");
  });

  it("rechaza una verificación que no son 4 dígitos sin llegar al servicio", async () => {
    expect((await consultar({ verificacion: "48a1" })).status).toBe(400);
    expect(rastrear).not.toHaveBeenCalled();
  });

  it(`bloquea la verificación del pedido tras ${config.rateLimit.rastreoVerificacionMax} fallos, aunque cambie la IP`, async () => {
    // Pedido propio de este test para no compartir el contador con los de arriba.
    PEDIDO.numeroPedido = "PED-0099";
    try {
      // Cada intento desde una IP distinta: el límite es por pedido.
      for (let i = 0; i < config.rateLimit.rastreoVerificacionMax; i++) {
        expect((await consultar({ numero: "PED-0099", verificacion: "0000" })).status).toBe(403);
      }
      const bloqueado = await consultar({ numero: "PED-0099", verificacion: "4821" });
      expect(bloqueado.status).toBe(429);

      // El nivel público y la sesión del dueño siguen funcionando.
      expect((await consultar({ numero: "PED-0099" })).status).toBe(200);
      expect((await (await consultar({ numero: "PED-0099", user: DUENO })).json()).data.detalleCompleto).toBe(true);
    } finally {
      PEDIDO.numeroPedido = "PED-0007";
    }
  });

  it("los aciertos no cuentan como intentos fallidos", async () => {
    PEDIDO.numeroPedido = "PED-0100";
    try {
      for (let i = 0; i < config.rateLimit.rastreoVerificacionMax + 2; i++) {
        expect((await consultar({ numero: "PED-0100", verificacion: "4821" })).status).toBe(200);
      }
    } finally {
      PEDIDO.numeroPedido = "PED-0007";
    }
  });
});
