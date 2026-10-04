import { jest } from "@jest/globals";
import express from "express";

// Integración de las rutas reales del libro: validación, honeypot, token de la
// constancia y roles del admin. Se simulan los bordes (JWT, membresías, BD) y
// el servicio, cuya lógica cubre libro.service.test.js. El token SÍ es real.
process.env.LIBRO_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
// El limiter real (5 por IP) cortaría la suite: todas las requests vienen de 127.0.0.1.
process.env.LIBRO_RATE_LIMIT_MAX = "1000";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const OTRA_TIENDA = "33333333-3333-4333-8333-333333333333";
const HOJA = "77777777-7777-4777-8777-777777777777";

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

const filaHoja = {
  id: HOJA, tiendaId: TIENDA, numero: "00001-2026", tipo: "reclamo", estado: "pendiente",
  fechaLimite: new Date("2026-10-27T00:00:00Z"), fechaRegistro: new Date("2026-10-05T15:00:00Z"),
  consumidorEmail: "ana@test.com", esMenor: false
};
const svc = {
  obtenerProveedor: jest.fn(async () => ({ nombre: "Zapatería", completo: true })),
  registrarHoja: jest.fn(async () => ({ hoja: filaHoja, tienda: { id: TIENDA, slug: "zapateria" } })),
  notificarRegistro: jest.fn(async () => {}),
  obtenerHojaPublica: jest.fn(async () => ({ id: HOJA, numero: "00001-2026" })),
  listarHojasAdmin: jest.fn(async () => ({ data: [], meta: {} })),
  resumenHojas: jest.fn(async () => ({ abiertas: 0, porVencer: 0, vencidas: 0 })),
  detalleHoja: jest.fn(async () => ({ id: HOJA })),
  marcarEnAtencion: jest.fn(async () => ({ id: HOJA, estado: "en_atencion" })),
  vistaPreviaRespuesta: jest.fn(async () => ({ subject: "s", html: "<p>x</p>" })),
  responderHoja: jest.fn(async () => ({ id: HOJA, estado: "respondida" })),
  exportarHojasCsv: jest.fn(async () => "﻿N° hoja\r\n")
};
jest.unstable_mockModule("../libro.service.js", () => svc);

const { default: storeRoutes } = await import("../libro.store.routes.js");
const { default: adminRoutes } = await import("../libro.admin.routes.js");
const { firmarTokenHoja } = await import("../libro.token.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Simula resolveTienda por subdominio con un header.
  app.use((req, res, next) => { const t = req.get("x-test-tienda"); if (t) req.tiendaId = t; next(); });
  app.use("/store/libro-reclamaciones", storeRoutes);
  app.use("/admin/libro-reclamaciones", adminRoutes);
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

async function request(method, path, { user, body, tienda } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers["x-test-user"] = user;
  if (tienda) headers["x-test-tienda"] = tienda;
  const res = await fetch(`${baseUrl}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* CSV */ }
  return { status: res.status, json, text, headers: res.headers };
}

const hoja = (extra = {}) => ({
  tiendaId: TIENDA, tipo: "reclamo",
  consumidorNombres: "Ana", consumidorApellidos: "Pérez", consumidorDocTipo: "DNI", consumidorDocNumero: "12345678",
  consumidorDomicilio: "Jr. Puno 456, Lima", consumidorEmail: "ANA@test.com",
  bienTipo: "producto", bienDescripcion: "Zapatillas talla 38", montoReclamado: "150",
  detalle: "Llegaron con la suela despegada y no responden.", pedidoConsumidor: "Cambio por un par nuevo",
  aceptaDeclaracion: true, ...extra
});

describe("POST /store/libro-reclamaciones", () => {
  it("registra sin login y devuelve número + token de la constancia", async () => {
    const r = await request("POST", "/store/libro-reclamaciones", { body: hoja() });

    expect(r.status).toBe(201);
    expect(r.json.data.numero).toBe("00001-2026");
    expect(r.json.data.token.split(".")).toHaveLength(3);
    expect(svc.registrarHoja).toHaveBeenCalledWith(
      expect.objectContaining({ consumidorEmail: "ana@test.com", montoReclamado: 150, medioRespuesta: "email" }),
      expect.objectContaining({ authUserId: null })
    );
    expect(svc.notificarRegistro).toHaveBeenCalled();
  });

  it("con sesión pasa el usuario al servicio", async () => {
    await request("POST", "/store/libro-reclamaciones", { user: "comprador", body: hoja() });
    expect(svc.registrarHoja.mock.calls[0][1].authUserId).toBe("comprador");
  });

  it.each([
    ["DNI de 7 dígitos", { consumidorDocNumero: "1234567" }, "consumidorDocNumero"],
    ["sin aceptar la declaración", { aceptaDeclaracion: false }, "aceptaDeclaracion"],
    ["detalle muy corto", { detalle: "mal" }, "detalle"],
    ["menor sin apoderado", { esMenor: true }, "apoderadoNombre"],
    ["correo inválido", { consumidorEmail: "ana" }, "consumidorEmail"]
  ])("400 con %s", async (_, extra, campo) => {
    const r = await request("POST", "/store/libro-reclamaciones", { body: hoja(extra) });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toContain(campo);
    expect(svc.registrarHoja).not.toHaveBeenCalled();
  });

  it("menor con apoderado válido pasa", async () => {
    const r = await request("POST", "/store/libro-reclamaciones", {
      body: hoja({ esMenor: true, apoderadoNombre: "Rosa Pérez", apoderadoDocTipo: "DNI", apoderadoDocNumero: "87654321" })
    });
    expect(r.status).toBe(201);
  });

  it("honeypot: responde 201 falso y no guarda nada", async () => {
    const r = await request("POST", "/store/libro-reclamaciones", { body: hoja({ sitioWeb: "http://spam" }) });
    expect(r.status).toBe(201);
    expect(r.json.data.numero).toBeNull();
    expect(svc.registrarHoja).not.toHaveBeenCalled();
  });

  it("en el subdominio de una tienda, el tiendaId del body se ignora", async () => {
    await request("POST", "/store/libro-reclamaciones", { body: hoja({ tiendaId: OTRA_TIENDA }), tienda: TIENDA });
    expect(svc.registrarHoja.mock.calls[0][0].tiendaId).toBe(TIENDA);
  });
});

describe("GET /store/libro-reclamaciones/hoja/:token", () => {
  it("con token válido devuelve la hoja sin caché", async () => {
    const token = await firmarTokenHoja({ hojaId: HOJA, tiendaId: TIENDA });
    const r = await request("GET", `/store/libro-reclamaciones/hoja/${token}`, { tienda: TIENDA });

    expect(r.status).toBe(200);
    expect(svc.obtenerHojaPublica).toHaveBeenCalledWith(TIENDA, HOJA);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it("token de la tienda A en el subdominio de la tienda B → 404 (R8.3)", async () => {
    const token = await firmarTokenHoja({ hojaId: HOJA, tiendaId: TIENDA });
    const r = await request("GET", `/store/libro-reclamaciones/hoja/${token}`, { tienda: OTRA_TIENDA });
    expect(r.status).toBe(404);
    expect(svc.obtenerHojaPublica).not.toHaveBeenCalled();
  });

  it("token alterado → 404", async () => {
    const token = await firmarTokenHoja({ hojaId: HOJA, tiendaId: TIENDA });
    const r = await request("GET", `/store/libro-reclamaciones/hoja/${token.slice(0, -2)}xx`);
    expect(r.status).toBe(404);
  });
});

describe("admin /libro-reclamaciones (R6.9)", () => {
  const respuesta = { tiendaId: TIENDA, respuesta: "Le enviaremos un par nuevo esta semana." };

  it("viewer ve la bandeja, el resumen y el detalle", async () => {
    expect((await request("GET", `/admin/libro-reclamaciones?tiendaId=${TIENDA}&estado=abiertas`, { user: "visor" })).status).toBe(200);
    expect((await request("GET", `/admin/libro-reclamaciones/resumen?tiendaId=${TIENDA}`, { user: "visor" })).status).toBe(200);
    expect((await request("GET", `/admin/libro-reclamaciones/${HOJA}?tiendaId=${TIENDA}`, { user: "visor" })).status).toBe(200);
  });

  it("viewer y editor no responden ni exportan", async () => {
    for (const user of ["visor", "editor"]) {
      expect((await request("POST", `/admin/libro-reclamaciones/${HOJA}/respuesta`, { user, body: respuesta })).status).toBe(403);
      expect((await request("GET", `/admin/libro-reclamaciones/exportar.csv?tiendaId=${TIENDA}`, { user })).status).toBe(403);
    }
    expect(svc.responderHoja).not.toHaveBeenCalled();
  });

  it("admin responde", async () => {
    const r = await request("POST", `/admin/libro-reclamaciones/${HOJA}/respuesta`, { user: "dueno", body: respuesta });
    expect(r.status).toBe(200);
    expect(svc.responderHoja).toHaveBeenCalledWith(TIENDA, HOJA, expect.objectContaining({ respuesta: respuesta.respuesta }), expect.anything());
  });

  it("respuesta demasiado corta → 400", async () => {
    const r = await request("POST", `/admin/libro-reclamaciones/${HOJA}/respuesta`, {
      user: "dueno", body: { tiendaId: TIENDA, respuesta: "Ok" }
    });
    expect(r.status).toBe(400);
  });

  it("admin exporta CSV como adjunto", async () => {
    const r = await request("GET", `/admin/libro-reclamaciones/exportar.csv?tiendaId=${TIENDA}&desde=2026-10-01`, { user: "dueno" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain("libro-reclamaciones-2026-10-01.csv");
  });

  it("no miembro de la tienda → 403", async () => {
    const r = await request("GET", `/admin/libro-reclamaciones?tiendaId=${OTRA_TIENDA}`, { user: "dueno" });
    expect(r.status).toBe(403);
  });
});
