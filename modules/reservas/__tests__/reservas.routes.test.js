import { jest } from "@jest/globals";
import express from "express";

// Integración de las rutas reales del mini booking: validación, honeypot,
// token de seguimiento y roles del admin. Se simulan los bordes (JWT,
// membresías, BD) y los servicios. El token SÍ es real.
process.env.RESERVAS_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
process.env.RESERVAS_RATE_LIMIT_MAX = "1000";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const OTRA_TIENDA = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "77777777-7777-4777-8777-777777777777";
const PRODUCTO = "44444444-4444-4444-8444-444444444444";
const MODALIDAD = "55555555-5555-4555-8555-555555555555";

const ROLES = { visor: "viewer", recepcion: "editor", dueno: "admin" };

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

jest.unstable_mockModule("../reservas.capturas.js", async () => {
  const { default: multer } = await import("multer");
  return { uploadCaptura: multer({ storage: multer.memoryStorage() }).single("captura"), subirCaptura: jest.fn(), urlCaptura: jest.fn() };
});

const svc = {
  cotizar: jest.fn(async () => ({ total: 100, errores: [] })),
  crearSolicitud: jest.fn(async () => ({
    pedido: { id: PEDIDO, numeroPedido: "PED-0012" }, tienda: { id: TIENDA, slug: "verona" }, token: "tkn.de.prueba", nueva: true
  })),
  notificarSolicitud: jest.fn(),
  obtenerSeguimiento: jest.fn(async () => ({ id: PEDIDO, estado: "solicitada" })),
  subirCapturaCliente: jest.fn(async () => ({ id: PEDIDO, estado: "pago_en_revision" })),
  cancelarPorCliente: jest.fn(async () => ({ id: PEDIDO, estado: "cancelada" })),
  urlSeguimiento: jest.fn(() => "http://localhost/verona/reserva/x"),
  listarReservasAdmin: jest.fn(async () => ({ data: [], meta: {} })),
  resumenReservas: jest.fn(async () => ({ porResponder: 1, pagoPorVerificar: 0, total: 1 })),
  detalleReservaAdmin: jest.fn(async () => ({ id: PEDIDO })),
  aceptarReserva: jest.fn(async () => ({ id: PEDIDO, estado: "aceptada" })),
  rechazarReserva: jest.fn(async () => ({ id: PEDIDO, estado: "rechazada" })),
  verificarPago: jest.fn(async () => ({ id: PEDIDO, estado: "confirmada" })),
  rechazarPago: jest.fn(async () => ({ id: PEDIDO, estado: "aceptada" })),
  cancelarPorNegocio: jest.fn(async () => ({ id: PEDIDO, estado: "cancelada" })),
  marcarNoShow: jest.fn(async () => ({ id: PEDIDO, estado: "no_show" })),
  agendaReservas: jest.fn(async () => ({ reservas: [] }))
};
jest.unstable_mockModule("../reservas.service.js", () => svc);

const configSvc = {
  obtenerConfig: jest.fn(async () => ({ tipoNegocio: "hotel", cobro: "total" })),
  configPublica: jest.fn(c => c),
  guardarConfig: jest.fn(async (t, data) => data)
};
jest.unstable_mockModule("../reservas.config.service.js", () => configSvc);
jest.unstable_mockModule("../cierres.service.js", () => ({
  cierresPublicos: jest.fn(async () => []), listarCierres: jest.fn(async () => []),
  crearCierre: jest.fn(async () => ({ id: "c1" })), eliminarCierre: jest.fn(async () => {})
}));
const habSvc = {
  listarHabitacionesStore: jest.fn(async () => []),
  obtenerHabitacionStore: jest.fn(async () => ({ id: PRODUCTO })),
  obtenerFichaAdmin: jest.fn(async () => null),
  listarHabitacionesAdmin: jest.fn(async () => []),
  guardarFicha: jest.fn(async () => ({ productoId: PRODUCTO }))
};
jest.unstable_mockModule("../hotel/habitaciones.service.js", () => habSvc);

const { default: storeRoutes } = await import("../reservas.store.routes.js");
const { default: adminRoutes } = await import("../reservas.admin.routes.js");
const { firmarTokenReserva } = await import("../reservas.token.js");
const { errorHandler } = await import("../../../middlewares/error.middleware.js");

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { const t = req.get("x-test-tienda"); if (t) req.tiendaId = t; next(); });
  app.use("/store/reservas", storeRoutes);
  app.use("/admin/reservas", adminRoutes);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

beforeEach(() => {
  for (const fn of [...Object.values(svc), ...Object.values(configSvc), ...Object.values(habSvc)]) fn.mockClear();
});

async function request(method, path, { user, body, tienda } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers["x-test-user"] = user;
  if (tienda) headers["x-test-tienda"] = tienda;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* vacío */ }
  return { status: res.status, json };
}

const solicitud = (extra = {}) => ({
  tiendaId: TIENDA, productoId: PRODUCTO, modalidadId: MODALIDAD, fecha: "2026-09-24", hora: "18:30", adultos: 2,
  titular: { nombres: "Diego", apellidos: "Luna Quinto", docTipo: "DNI", docNumero: "44836469", nacionalidad: "pe", nacimiento: "1990-01-15" },
  whatsapp: "957 625 308", email: "DIEGO@test.com", aceptaDatos: true,
  idempotencyKey: "99999999-9999-4999-8999-999999999999",
  ...extra
});

describe("POST /store/reservas (solicitud)", () => {
  it("crea la solicitud sin login y devuelve código + token de seguimiento", async () => {
    const r = await request("POST", "/store/reservas", { body: solicitud() });
    expect(r.status).toBe(201);
    expect(r.json.data).toEqual(expect.objectContaining({ codigo: "PED-0012", token: "tkn.de.prueba" }));
    expect(svc.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({ email: "diego@test.com", ninos: 0, titular: expect.objectContaining({ nacionalidad: "PE" }) }),
      expect.objectContaining({ authUserId: null })
    );
    expect(svc.notificarSolicitud).toHaveBeenCalled();
  });

  it("un reintento con la misma clave responde 200 y no vuelve a notificar", async () => {
    svc.crearSolicitud.mockResolvedValueOnce({
      pedido: { id: PEDIDO, numeroPedido: "PED-0012" }, tienda: { id: TIENDA, slug: "verona" }, token: "t", nueva: false
    });
    const r = await request("POST", "/store/reservas", { body: solicitud() });
    expect(r.status).toBe(200);
    expect(svc.notificarSolicitud).not.toHaveBeenCalled();
  });

  it("el subdominio manda sobre el tiendaId del body", async () => {
    await request("POST", "/store/reservas", { body: solicitud({ tiendaId: OTRA_TIENDA }), tienda: TIENDA });
    expect(svc.crearSolicitud.mock.calls[0][0].tiendaId).toBe(TIENDA);
  });

  it("honeypot: responde como creada sin crear nada", async () => {
    const r = await request("POST", "/store/reservas", { body: solicitud({ sitioWeb: "http://spam" }) });
    expect(r.status).toBe(201);
    expect(svc.crearSolicitud).not.toHaveBeenCalled();
  });

  it.each([
    ["DNI de 7 dígitos", { titular: { ...solicitud().titular, docNumero: "1234567" } }, "titular.docNumero"],
    ["sin aceptar el tratamiento de datos", { aceptaDatos: false }, "aceptaDatos"],
    ["hora inválida", { hora: "25:00" }, "hora"],
    ["sin adultos", { adultos: 0 }, "adultos"],
    ["RUC inválido en la factura", { factura: { ruc: "20123", razonSocial: "Empresa SAC" } }, "factura.ruc"],
    ["sin clave de idempotencia", { idempotencyKey: undefined }, "idempotencyKey"]
  ])("400 con %s", async (_, extra, campo) => {
    const r = await request("POST", "/store/reservas", { body: solicitud(extra) });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toContain(campo);
    expect(svc.crearSolicitud).not.toHaveBeenCalled();
  });
});

describe("seguimiento con token", () => {
  it("con un token válido devuelve la reserva", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: TIENDA });
    const r = await request("GET", `/store/reservas/seguimiento/${token}`);
    expect(r.status).toBe(200);
    expect(svc.obtenerSeguimiento).toHaveBeenCalledWith(TIENDA, PEDIDO);
  });

  it("un token de otra tienda en este subdominio responde 404", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: OTRA_TIENDA });
    const r = await request("GET", `/store/reservas/seguimiento/${token}`, { tienda: TIENDA });
    expect(r.status).toBe(404);
  });

  it("un token alterado responde 404", async () => {
    const r = await request("GET", "/store/reservas/seguimiento/eyJ.alterado.xx");
    expect(r.status).toBe(404);
  });

  it("el cliente puede cancelar", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: TIENDA });
    const r = await request("POST", `/store/reservas/seguimiento/${token}/cancelar`);
    expect(r.status).toBe(200);
    expect(svc.cancelarPorCliente).toHaveBeenCalledWith(TIENDA, PEDIDO);
  });
});

describe("admin: roles", () => {
  it("sin sesión responde 401", async () => {
    const r = await request("GET", `/admin/reservas?tiendaId=${TIENDA}`);
    expect(r.status).toBe(401);
  });

  it("el visor ve la bandeja pero no puede aceptar", async () => {
    expect((await request("GET", `/admin/reservas?tiendaId=${TIENDA}`, { user: "visor" })).status).toBe(200);
    const r = await request("POST", `/admin/reservas/${PEDIDO}/aceptar`, { user: "visor", body: { tiendaId: TIENDA } });
    expect(r.status).toBe(403);
    expect(svc.aceptarReserva).not.toHaveBeenCalled();
  });

  it("recepción (editor) acepta y verifica pagos", async () => {
    const a = await request("POST", `/admin/reservas/${PEDIDO}/aceptar`, { user: "recepcion", body: { tiendaId: TIENDA } });
    expect(a.status).toBe(200);
    expect(svc.aceptarReserva).toHaveBeenCalledWith(TIENDA, PEDIDO, expect.objectContaining({ nuevoTotal: null }), expect.anything());
    const v = await request("POST", `/admin/reservas/${PEDIDO}/verificar-pago`, { user: "recepcion", body: { tiendaId: TIENDA } });
    expect(v.status).toBe(200);
  });

  it("recepción no puede cambiar la configuración; el dueño sí", async () => {
    const body = { tiendaId: TIENDA, avisoProximoHoras: 3 };
    expect((await request("PUT", "/admin/reservas/config", { user: "recepcion", body })).status).toBe(403);
    const r = await request("PUT", "/admin/reservas/config", { user: "dueno", body });
    expect(r.status).toBe(200);
    expect(configSvc.guardarConfig).toHaveBeenCalledWith(TIENDA, { avisoProximoHoras: 3 }, expect.anything());
  });

  it("un ajuste del total exige un motivo", async () => {
    const r = await request("POST", `/admin/reservas/${PEDIDO}/aceptar`, { user: "recepcion", body: { tiendaId: TIENDA, nuevoTotal: 90 } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toContain("ajusteMotivo");
  });

  it("modalidades repetidas en la ficha responden 400", async () => {
    const r = await request("PUT", `/admin/reservas/habitaciones/${PRODUCTO}`, {
      user: "dueno",
      body: {
        tiendaId: TIENDA, capacidadAdultos: 2, capacidadMax: 2,
        modalidades: [{ tipo: "horas", horas: 6, precio: 100 }, { tipo: "horas", horas: 6, precio: 120 }]
      }
    });
    expect(r.status).toBe(400);
    expect(habSvc.guardarFicha).not.toHaveBeenCalled();
  });
});
