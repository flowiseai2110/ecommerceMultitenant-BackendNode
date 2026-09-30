import { jest } from "@jest/globals";
import express from "express";

// Prueba de integración de las rutas reales de admin que no operan sobre una
// tienda concreta: un JWT válido de comprador (login con Google en el
// storefront) NO debe bastar para crear tiendas ni usar el studio de IA.
//
// Se simulan solo los bordes: el JWT (header x-test-user en vez de Supabase)
// y la membresía (en vez de la BD). Ningún caso llega a escribir en la BD:
// el comerciante se prueba con un body inválido, así un 400 de validación
// demuestra que atravesó el guard.

const hasAnyActiveMembership = jest.fn();

// El cliente generado por Prisma 7 es TypeScript (Node lo ejecuta con type
// stripping, Jest no puede parsearlo). Ningún caso llega a la BD, así que
// basta un stub: cualquier acceso a un modelo devuelve un objeto vacío.
const PrismaStub = {
  PrismaClientKnownRequestError: class extends Error {},
  PrismaClientValidationError: class extends Error {}
};
const prismaStub = new Proxy({}, { get: () => ({}) });
jest.unstable_mockModule("../../generated/prisma/client.ts", () => ({ Prisma: PrismaStub, PrismaClient: class {} }));
jest.unstable_mockModule("../../config/prisma.js", () => ({ prisma: prismaStub, Prisma: PrismaStub, default: prismaStub }));

jest.unstable_mockModule("../../middlewares/auth.middleware.js", async () => {
  const { UnauthorizedError } = await import("../../utils/errors.js");
  const authMiddleware = (req, res, next) => {
    const userId = req.get("x-test-user");
    if (!userId) return next(new UnauthorizedError("Token de autenticación no proporcionado"));
    req.user = { id: userId, email: `${userId}@test.com`, role: "authenticated", metadata: {} };
    next();
  };
  const passthrough = () => (req, res, next) => next();
  return { authMiddleware, optionalAuth: authMiddleware, requireRole: passthrough, default: {} };
});
// Ningún caso llega al controller (el guard o la validación responden antes);
// mockearlo evita cargar los servicios de IA, cuyos setInterval de limpieza
// dejarían a Jest colgado al terminar.
const generarStudio = jest.fn((req, res) => res.status(202).json({}));
jest.unstable_mockModule("../../controllers/studio.controller.js", () => ({
  generarStudio,
  consultarEstadoStudio: jest.fn((req, res) => res.status(200).json({}))
}));
jest.unstable_mockModule("../../kernel/tenant/membership.js", () => ({
  findActiveMembership: jest.fn().mockResolvedValue(null),
  hasAnyActiveMembership
}));

const { default: tiendasRoutes } = await import("../../modules/tenants/tiendas.admin.routes.js");
const { default: studioRoutes } = await import("../studio.routes.js");
const { errorHandler } = await import("../../middlewares/error.middleware.js");

const COMPRADOR = "comprador-google";
const COMERCIANTE = "comerciante-invitado";

const TIENDA_VALIDA = { nombre: "Tienda Pirata", slug: "tienda-pirata" };

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/admin/tiendas", tiendasRoutes);
  app.use("/admin/studio", studioRoutes);
  app.use(errorHandler);

  await new Promise(resolve => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  hasAnyActiveMembership.mockReset();
  hasAnyActiveMembership.mockImplementation(async userId => userId === COMERCIANTE);
});

function request(method, path, { user, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers["x-test-user"] = user;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("POST /admin/tiendas", () => {
  it("sin token responde 401", async () => {
    const res = await request("POST", "/admin/tiendas", { body: TIENDA_VALIDA });

    expect(res.status).toBe(401);
    expect(hasAnyActiveMembership).not.toHaveBeenCalled();
  });

  it("un comprador con JWT válido pero sin membresías recibe 403", async () => {
    const res = await request("POST", "/admin/tiendas", { user: COMPRADOR, body: TIENDA_VALIDA });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(hasAnyActiveMembership).toHaveBeenCalledWith(COMPRADOR);
  });

  it("el guard corre antes de la validación: el comprador recibe 403 aun con body inválido", async () => {
    const res = await request("POST", "/admin/tiendas", { user: COMPRADOR, body: {} });

    expect(res.status).toBe(403);
  });

  it("un comerciante atraviesa el guard (llega a la validación del body)", async () => {
    const res = await request("POST", "/admin/tiendas", { user: COMERCIANTE, body: {} });

    expect(res.status).toBe(400);
    expect(hasAnyActiveMembership).toHaveBeenCalledWith(COMERCIANTE);
  });
});

describe("Studio de IA (/admin/studio)", () => {
  it("POST /generar-ia sin token responde 401", async () => {
    const res = await request("POST", "/admin/studio/generar-ia", {
      body: { tipo: "logo", prompt: "un logo" }
    });

    expect(res.status).toBe(401);
  });

  it("POST /generar-ia bloquea con 403 a un comprador (la IA tiene costo)", async () => {
    const res = await request("POST", "/admin/studio/generar-ia", {
      user: COMPRADOR,
      body: { tipo: "logo", prompt: "un logo" }
    });

    expect(res.status).toBe(403);
    expect(generarStudio).not.toHaveBeenCalled();
  });

  it("GET /generar-ia/:taskId bloquea con 403 a un comprador", async () => {
    const res = await request("GET", "/admin/studio/generar-ia/task-123", { user: COMPRADOR });

    expect(res.status).toBe(403);
  });

  it("POST /generar-ia deja pasar a un comerciante (llega a la validación del body)", async () => {
    const res = await request("POST", "/admin/studio/generar-ia", {
      user: COMERCIANTE,
      body: { tipo: "no-existe" }
    });

    expect(res.status).toBe(400);
  });
});
