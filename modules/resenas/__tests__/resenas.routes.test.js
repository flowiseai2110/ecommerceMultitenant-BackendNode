import { jest } from "@jest/globals";
import express from "express";

// Integración de las rutas reales de reseñas: sesión, token del link y roles
// del admin. Se simulan los bordes (JWT de Supabase por header, membresías, BD)
// y el servicio, cuya lógica ya cubre resenas.service.test.js. El token del
// link SÍ es real (firma HS256 con este secreto).
process.env.RESENAS_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const OTRA_TIENDA = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "11111111-1111-4111-8111-111111111111";
const OTRO_PEDIDO = "44444444-4444-4444-8444-444444444444";
const PRODUCTO = "55555555-5555-4555-8555-555555555555";
const RESENA = "66666666-6666-4666-8666-666666666666";

// Rol de cada usuario de prueba en TIENDA (sin entrada = no es miembro).
const ROLES = { visor: "viewer", editor: "editor", dueno: "admin" };

const PrismaStub = {
  PrismaClientKnownRequestError: class extends Error {},
  PrismaClientValidationError: class extends Error {}
};
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: PrismaStub, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: PrismaStub, default: {} }));

jest.unstable_mockModule("../../../middlewares/auth.middleware.js", async () => {
  const { UnauthorizedError } = await import("../../../utils/errors.js");
  const usuario = (req) => {
    const id = req.get("x-test-user");
    return id ? { id, email: `${id}@test.com`, role: "authenticated", metadata: {} } : null;
  };
  return {
    authMiddleware: (req, res, next) => {
      req.user = usuario(req);
      next(req.user ? undefined : new UnauthorizedError("Token de autenticación no proporcionado"));
    },
    optionalAuth: (req, res, next) => { req.user = usuario(req); next(); },
    requireRole: () => (req, res, next) => next(),
    default: {}
  };
});
jest.unstable_mockModule("../../../kernel/tenant/membership.js", () => ({
  findActiveMembership: jest.fn(async (userId, tiendaId) =>
    tiendaId === TIENDA && ROLES[userId] ? { userId, tiendaId, rol: ROLES[userId] } : null),
  hasAnyActiveMembership: jest.fn(async userId => !!ROLES[userId])
}));
jest.unstable_mockModule("../../../services/roles.service.js", () => ({
  getCodigoRol: jest.fn(async rol => rol),
  getRolesUsuario: jest.fn()
}));

const svc = {
  guardarResena: jest.fn(async () => ({ resena: { id: RESENA }, estado: "pendiente", publicada: false })),
  listarResenasProducto: jest.fn(async () => ({
    data: [], meta: { total: 0, page: 1, limit: 10 }, resumen: { promedio: 0, cantidad: 0, distribucion: {} }
  })),
  listarResenables: jest.fn(async () => []),
  listarResenasAdmin: jest.fn(async () => ({ data: [], meta: {} })),
  cambiarEstadoResena: jest.fn(async () => ({ id: RESENA })),
  responderResena: jest.fn(async () => ({ id: RESENA })),
  getModoModeracion: jest.fn(async () => "previa"),
  setModoModeracion: jest.fn(async (t, modo) => ({ moderacion: modo }))
};
jest.unstable_mockModule("../resenas.service.js", () => svc);

const { default: storeRoutes } = await import("../resenas.store.routes.js");
const { default: adminRoutes } = await import("../resenas.admin.routes.js");
const { firmarTokenResena } = await import("../resenas.token.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/store/resenas", storeRoutes);
  app.use("/admin/resenas", adminRoutes);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockClear();
});

async function request(method, path, { user, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers["x-test-user"] = user;
  const res = await fetch(`${baseUrl}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

const resena = (extra = {}) => ({ tiendaId: TIENDA, productoId: PRODUCTO, estrellas: 5, comentario: "Excelente", ...extra });

describe("POST /store/resenas", () => {
  it("sin sesión ni token responde 401 y no guarda", async () => {
    const r = await request("POST", "/store/resenas", { body: resena({ pedidoId: PEDIDO }) });

    expect(r.status).toBe(401);
    expect(svc.guardarResena).not.toHaveBeenCalled();
  });

  it("con sesión guarda con su usuario y verificación por cuenta (no por token)", async () => {
    const r = await request("POST", "/store/resenas", { user: "comprador", body: resena({ pedidoId: PEDIDO }) });

    expect(r.status).toBe(201);
    expect(svc.guardarResena).toHaveBeenCalledWith(expect.objectContaining({
      tiendaId: TIENDA, pedidoId: PEDIDO, productoId: PRODUCTO, estrellas: 5,
      authUserId: "comprador", porToken: false
    }));
  });

  it("con el link de WhatsApp funciona sin sesión y el pedido sale del token", async () => {
    const token = await firmarTokenResena({ pedidoId: PEDIDO, tiendaId: TIENDA });

    const r = await request("POST", "/store/resenas", { body: resena({ token }) });

    expect(r.status).toBe(201);
    expect(svc.guardarResena).toHaveBeenCalledWith(expect.objectContaining({
      pedidoId: PEDIDO, authUserId: null, porToken: true
    }));
  });

  it("un link de otra tienda no sirve (404)", async () => {
    const token = await firmarTokenResena({ pedidoId: PEDIDO, tiendaId: OTRA_TIENDA });

    const r = await request("POST", "/store/resenas", { body: resena({ token }) });

    expect(r.status).toBe(404);
    expect(svc.guardarResena).not.toHaveBeenCalled();
  });

  it("no se puede usar un link para reseñar OTRO pedido (403)", async () => {
    const token = await firmarTokenResena({ pedidoId: PEDIDO, tiendaId: TIENDA });

    const r = await request("POST", "/store/resenas", { body: resena({ token, pedidoId: OTRO_PEDIDO }) });

    expect(r.status).toBe(403);
    expect(svc.guardarResena).not.toHaveBeenCalled();
  });

  it("un link alterado responde 401", async () => {
    const token = await firmarTokenResena({ pedidoId: PEDIDO, tiendaId: TIENDA });

    const r = await request("POST", "/store/resenas", { body: resena({ token: token.slice(0, -4) + "AAAA" }) });

    expect(r.status).toBe(401);
  });

  it.each([0, 6, 3.5])("estrellas=%p es inválido (400)", async (estrellas) => {
    const r = await request("POST", "/store/resenas", { user: "comprador", body: resena({ pedidoId: PEDIDO, estrellas }) });

    expect(r.status).toBe(400);
  });

  it("acepta solo estrellas, sin comentario", async () => {
    const r = await request("POST", "/store/resenas", {
      user: "comprador", body: resena({ pedidoId: PEDIDO, comentario: "   " })
    });

    expect(r.status).toBe(201);
    expect(svc.guardarResena.mock.calls[0][0].comentario).toBeNull();
  });
});

describe("lecturas del storefront", () => {
  it("GET /producto/:id es público, cacheable y trae el resumen en meta", async () => {
    const r = await request("GET", `/store/resenas/producto/${PRODUCTO}?tiendaId=${TIENDA}`);

    expect(r.status).toBe(200);
    expect(r.json.meta.resumen).toBeDefined();
    expect(r.headers.get("cache-control")).toMatch(/max-age=60/);
  });

  it("GET /mis-compras exige sesión", async () => {
    const r = await request("GET", `/store/resenas/mis-compras?tiendaId=${TIENDA}`);

    expect(r.status).toBe(401);
  });

  it("GET /enlace/:token lista el pedido del token, sin sesión", async () => {
    const token = await firmarTokenResena({ pedidoId: PEDIDO, tiendaId: TIENDA });

    const r = await request("GET", `/store/resenas/enlace/${token}`);

    expect(r.status).toBe(200);
    expect(svc.listarResenables).toHaveBeenCalledWith(TIENDA, { pedidoId: PEDIDO });
  });
});

describe("admin /admin/resenas — permisos por rol", () => {
  it("un comprador (no miembro de la tienda) no ve la bandeja (403)", async () => {
    const r = await request("GET", `/admin/resenas?tiendaId=${TIENDA}`, { user: "comprador" });

    expect(r.status).toBe(403);
    expect(svc.listarResenasAdmin).not.toHaveBeenCalled();
  });

  it("un viewer ve la bandeja pero no puede moderar", async () => {
    const lista = await request("GET", `/admin/resenas?tiendaId=${TIENDA}`, { user: "visor" });
    const moderar = await request("PATCH", `/admin/resenas/${RESENA}/estado`, {
      user: "visor", body: { tiendaId: TIENDA, estado: "aprobada" }
    });

    expect(lista.status).toBe(200);
    expect(moderar.status).toBe(403);
    expect(svc.cambiarEstadoResena).not.toHaveBeenCalled();
  });

  it("un editor puede aprobar y responder", async () => {
    const aprobar = await request("PATCH", `/admin/resenas/${RESENA}/estado`, {
      user: "editor", body: { tiendaId: TIENDA, estado: "aprobada" }
    });
    const responder = await request("PUT", `/admin/resenas/${RESENA}/respuesta`, {
      user: "editor", body: { tiendaId: TIENDA, respuesta: "¡Gracias por tu compra!" }
    });

    expect(aprobar.status).toBe(200);
    expect(svc.cambiarEstadoResena).toHaveBeenCalledWith(TIENDA, RESENA, "aprobada", expect.objectContaining({ id: "editor" }));
    expect(responder.status).toBe(200);
  });

  it("moderar no permite volver a 'pendiente' (400)", async () => {
    const r = await request("PATCH", `/admin/resenas/${RESENA}/estado`, {
      user: "editor", body: { tiendaId: TIENDA, estado: "pendiente" }
    });

    expect(r.status).toBe(400);
  });

  it("cambiar el modo de moderación exige rol admin", async () => {
    const editor = await request("PUT", "/admin/resenas/config", {
      user: "editor", body: { tiendaId: TIENDA, moderacion: "automatica" }
    });
    const dueno = await request("PUT", "/admin/resenas/config", {
      user: "dueno", body: { tiendaId: TIENDA, moderacion: "automatica" }
    });

    expect(editor.status).toBe(403);
    expect(dueno.status).toBe(200);
    expect(svc.setModoModeracion).toHaveBeenCalledTimes(1);
  });
});
