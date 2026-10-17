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
  agendaReservas: jest.fn(async () => ({ reservas: [] })),
  reenviarCorreo: jest.fn(async () => ({ enviadoA: "c@test.com" })),
  resumenHotel: jest.fn(async () => ({ llegadas: { total: 1, pendientes: 1 } })),
  aplicarAccion: jest.fn(), efectivoDe: jest.fn(), pedidoDeReserva: jest.fn()
};
jest.unstable_mockModule("../reservas.service.js", () => svc);

// Ciclo de la reserva del hotel (ciclo-reserva-hotel).
const cicloSvc = {
  registrarCheckin: jest.fn(async () => ({ id: PEDIDO, estado: "hospedada" })),
  registrarCheckout: jest.fn(async () => ({ id: PEDIDO, estado: "completada" })),
  guardarCodigoPms: jest.fn(async () => ({ id: PEDIDO, codigoPms: "NB-1" })),
  agregarNota: jest.fn(async () => ({ id: PEDIDO })),
  cobrarEnMostrador: jest.fn(),
  modificarReserva: jest.fn(async () => ({ id: PEDIDO })),
  cambiarSalida: jest.fn(async () => ({ id: PEDIDO })),
  cancelarHotel: jest.fn(async () => ({ id: PEDIDO, estado: "cancelada" })),
  marcarNoLlego: jest.fn(async () => ({ id: PEDIDO, estado: "no_show" })),
  responderHorario: jest.fn(async () => ({ id: PEDIDO })),
  darSalidaTardia: jest.fn(async () => ({ id: PEDIDO }))
};
jest.unstable_mockModule("../hotel/ciclo.service.js", () => cicloSvc);

// Cupo a la venta (motor-reservas-hotel M2).
const cupoSvc = {
  detalleNoche: jest.fn(async () => ({})),
  fijarLibres: jest.fn(async () => ({ noches: 2, ajustadas: [] }))
};
jest.unstable_mockModule("../hotel/cupo.service.js", () => cupoSvc);

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
const preciosSvc = { preciosPorNoche: jest.fn(async () => [{ productoId: PRODUCTO, precios: { "2026-11-06": 255, "2026-11-07": null } }]) };
jest.unstable_mockModule("../hotel/precios-calendario.js", () => preciosSvc);

// Alquiler de locales (alquiler-locales L1.15): servicios simulados.
const localesSvc = {
  disponibilidadSalones: jest.fn(async () => []),
  calendarioStore: jest.fn(async () => ({ fechas: [] })),
  calendarioAdmin: jest.fn(async () => ({ fechas: [], ocupaciones: [] })),
  crearBloqueo: jest.fn(async () => ({ id: "b1" })),
  eliminarBloqueo: jest.fn(async () => {}),
  crearCotizacion: jest.fn(async () => ({ token: "tkn", url: "u", cotizacion: {} })),
  obtenerCotizacionStore: jest.fn(async () => ({ id: "c1" })),
  listarCotizacionesAdmin: jest.fn(async () => ({ data: [], meta: {} }))
};
jest.unstable_mockModule("../locales/locales.service.js", () => localesSvc);
const cuotasSvc = {
  aceptarContrato: jest.fn(async () => ({ id: PEDIDO })),
  subirCapturaCuota: jest.fn(async () => ({ id: PEDIDO })),
  verificarCuota: jest.fn(async () => ({ id: PEDIDO })),
  rechazarCuota: jest.fn(async () => ({ id: PEDIDO })),
  editarPlan: jest.fn(async () => ({ id: PEDIDO }))
};
jest.unstable_mockModule("../locales/cuotas.service.js", () => cuotasSvc);
const salonesSvc = {
  listarSalonesStore: jest.fn(async () => []), obtenerSalonStore: jest.fn(async () => ({})),
  listarSalonesAdmin: jest.fn(async () => []), obtenerFichaSalonAdmin: jest.fn(async () => null), guardarFichaSalon: jest.fn(async () => ({}))
};
jest.unstable_mockModule("../locales/salones.service.js", () => salonesSvc);
const canchasSvc = {
  listarCanchasStore: jest.fn(async () => []), obtenerCanchaStore: jest.fn(async () => ({})), agendaStore: jest.fn(async () => ({ canchas: [] })),
  listarCanchasAdmin: jest.fn(async () => []), obtenerFichaCanchaAdmin: jest.fn(async () => null), guardarFichaCancha: jest.fn(async () => ({})),
  agendaAdmin: jest.fn(async () => ({ canchas: [] })), crearBloqueo: jest.fn(async () => ({})), eliminarBloqueo: jest.fn(async () => {}),
  cargarCanchaParaReserva: jest.fn()
};
jest.unstable_mockModule("../canchas/canchas.service.js", () => canchasSvc);
// Pago automático (docs/specs/pago-automatico): su lógica se prueba en modules/pagos/__tests__.
const pagoSvc = { pagarReserva: jest.fn(async () => ({ pago: { estado: "pagado" }, reserva: { id: "r" } })) };
jest.unstable_mockModule("../reservas.pago.js", () => pagoSvc);
const partesSvc = {
  dividirPago: jest.fn(async () => ({})), partesDeReserva: jest.fn(async () => []),
  obtenerParte: jest.fn(async () => ({})), pagarParte: jest.fn(async () => ({}))
};
jest.unstable_mockModule("../canchas/partes.js", () => partesSvc);
const estadiaSvc = { registrarCheckin: jest.fn(async () => ({})), solicitarCambioFechas: jest.fn(async () => ({})) };
jest.unstable_mockModule("../hotel/estadia-cliente.js", () => estadiaSvc);
const CUOTA = "88888888-8888-4888-8888-888888888888";

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
  // Lo que deja resolverIdioma en /store (docs/specs/idiomas D2): aquí, el pedido tal cual.
  app.use((req, res, next) => { req.idioma = { codigo: req.query.lang ?? req.body?.lang ?? "es" }; next(); });
  app.use("/store/reservas", storeRoutes);
  app.use("/admin/reservas", adminRoutes);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

beforeEach(() => {
  for (const fn of [...Object.values(svc), ...Object.values(configSvc), ...Object.values(habSvc), ...Object.values(localesSvc), ...Object.values(cuotasSvc), ...Object.values(canchasSvc)]) fn.mockClear();
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

// reserva-hotel-mejoras H1: precio por noche para el calendario de la tienda.
describe("GET /store/reservas/habitaciones-precios", () => {
  it("devuelve el precio por noche de cada tipo, con caché pública", async () => {
    const r = await request("GET", `/store/reservas/habitaciones-precios?tiendaId=${TIENDA}&desde=2026-11-01&hasta=2026-11-30`);
    expect(r.status).toBe(200);
    expect(r.json.data[0].precios["2026-11-06"]).toBe(255);
    expect(preciosSvc.preciosPorNoche).toHaveBeenCalledWith(TIENDA, "2026-11-01", "2026-11-30");
  });

  it("rechaza un rango de más de 62 días", async () => {
    const r = await request("GET", `/store/reservas/habitaciones-precios?tiendaId=${TIENDA}&desde=2026-11-01&hasta=2027-02-01`);
    expect(r.status).toBe(400);
  });
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

  it("paga en línea con el token de la pasarela (pago-automatico R3.1)", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: TIENDA });
    const r = await request("POST", `/store/reservas/seguimiento/${token}/pago`, { body: { tokenId: "tkn_sim_1", metodo: "tarjeta" } });
    expect(r.status).toBe(201);
    expect(pagoSvc.pagarReserva).toHaveBeenCalledWith(TIENDA, PEDIDO, { tokenId: "tkn_sim_1", metodo: "tarjeta" });
  });

  it("rechaza un método de pago que no es de la pasarela", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: TIENDA });
    pagoSvc.pagarReserva.mockClear();
    const r = await request("POST", `/store/reservas/seguimiento/${token}/pago`, { body: { tokenId: "tkn_sim_1", metodo: "transferencia" } });
    expect(r.status).toBe(400);
    expect(pagoSvc.pagarReserva).not.toHaveBeenCalled();
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

describe("cupo a la venta (motor-reservas-hotel M2)", () => {
  const body = { tiendaId: TIENDA, productoId: PRODUCTO, desde: "2026-10-16", hasta: "2026-10-17", dias: [5, 6], libres: 2 };

  it("recepción (editor) fija los libres; el visor no", async () => {
    expect((await request("PUT", "/admin/reservas/disponibilidad/libres", { user: "visor", body })).status).toBe(403);
    const r = await request("PUT", "/admin/reservas/disponibilidad/libres", { user: "recepcion", body });
    expect(r.status).toBe(200);
    expect(cupoSvc.fijarLibres).toHaveBeenCalledWith(TIENDA,
      { productoId: PRODUCTO, desde: "2026-10-16", hasta: "2026-10-17", dias: [5, 6], libres: 2 }, expect.anything());
  });

  it("libres negativos o un rango invertido responden 400", async () => {
    expect((await request("PUT", "/admin/reservas/disponibilidad/libres", { user: "recepcion", body: { ...body, libres: -1 } })).status).toBe(400);
    expect((await request("PUT", "/admin/reservas/disponibilidad/libres", { user: "recepcion", body: { ...body, hasta: "2026-10-15" } })).status).toBe(400);
  });

  it("el detalle de una noche lo ve cualquier miembro", async () => {
    const r = await request("GET", `/admin/reservas/disponibilidad/noche?tiendaId=${TIENDA}&productoId=${PRODUCTO}&fecha=2026-10-16`, { user: "visor" });
    expect(r.status).toBe(200);
    expect(cupoSvc.detalleNoche).toHaveBeenCalledWith(TIENDA, PRODUCTO, "2026-10-16");
  });
});

describe("locales (alquiler-locales)", () => {
  const cotizacion = (extra = {}) => ({
    tiendaId: TIENDA, productoId: PRODUCTO, paqueteId: MODALIDAD, fecha: "2026-12-05", invitados: 150, tipoEvento: "quinceanos", ...extra
  });

  it("cotización: valida invitados y tipo de evento antes del servicio", async () => {
    const r = await request("POST", "/store/reservas/locales/cotizaciones", { body: cotizacion({ invitados: 0, tipoEvento: "baile" }) });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toEqual(expect.arrayContaining(["invitados", "tipoEvento"]));
    expect(localesSvc.crearCotizacion).not.toHaveBeenCalled();
    const ok = await request("POST", "/store/reservas/locales/cotizaciones", { body: cotizacion({ canalOrigen: "tiktok" }) });
    expect(ok.status).toBe(201);
    expect(localesSvc.crearCotizacion).toHaveBeenCalledWith(TIENDA, expect.objectContaining({ canalOrigen: "tiktok" }), { creadaPor: "cliente" });
  });

  it("calendario: máximo 62 días", async () => {
    const r = await request("GET", `/store/reservas/locales/salones/imperial/calendario?tiendaId=${TIENDA}&desde=2026-12-01&hasta=2027-03-01`);
    expect(r.status).toBe(400);
  });

  it("contrato: exige la casilla y el hash del texto leído", async () => {
    const token = await firmarTokenReserva({ pedidoId: PEDIDO, tiendaId: TIENDA });
    const sin = await request("POST", `/store/reservas/seguimiento/${token}/contrato`, { body: { version: 1, hash: "a".repeat(64) } });
    expect(sin.status).toBe(400);
    const ok = await request("POST", `/store/reservas/seguimiento/${token}/contrato`, { body: { version: 1, hash: "a".repeat(64), acepta: true } });
    expect(ok.status).toBe(200);
    expect(cuotasSvc.aceptarContrato).toHaveBeenCalledWith(TIENDA, PEDIDO, expect.objectContaining({ version: 1 }), expect.anything());
  });

  it("cuotas: verificar es de editor+, editar el plan valida montos", async () => {
    expect((await request("POST", `/admin/reservas/${PEDIDO}/cuotas/${CUOTA}/verificar`, { user: "visor", body: { tiendaId: TIENDA } })).status).toBe(403);
    expect((await request("POST", `/admin/reservas/${PEDIDO}/cuotas/${CUOTA}/verificar`, { user: "recepcion", body: { tiendaId: TIENDA } })).status).toBe(200);
    expect(cuotasSvc.verificarCuota).toHaveBeenCalledWith(TIENDA, PEDIDO, CUOTA, expect.anything());
    const malo = await request("PUT", `/admin/reservas/${PEDIDO}/plan`, { user: "recepcion", body: { tiendaId: TIENDA, cuotas: [{ concepto: "cuota", monto: 0, venceEn: "2026-11-01" }] } });
    expect(malo.status).toBe(400);
    expect(cuotasSvc.editarPlan).not.toHaveBeenCalled();
  });

  it("cotización del negocio: un ajuste exige motivo", async () => {
    const r = await request("POST", "/admin/reservas/locales/cotizaciones", { user: "recepcion", body: cotizacion({ nuevoTotal: 7000 }) });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toContain("ajusteMotivo");
  });

  it("bloqueo manual: horas incompletas responden 400; editor+ puede bloquear", async () => {
    const body = { tiendaId: TIENDA, productoId: PRODUCTO, fecha: "2026-12-05" };
    expect((await request("POST", "/admin/reservas/locales/bloqueos", { user: "recepcion", body: { ...body, horaInicio: "19:00" } })).status).toBe(400);
    expect((await request("POST", "/admin/reservas/locales/bloqueos", { user: "visor", body })).status).toBe(403);
    expect((await request("POST", "/admin/reservas/locales/bloqueos", { user: "recepcion", body: { ...body, motivo: "Vendida por WhatsApp" } })).status).toBe(200);
  });
});

describe("canchas (alquiler-canchas)", () => {
  it("agenda de la vitrina: exige la fecha", async () => {
    expect((await request("GET", `/store/reservas/canchas/agenda?tiendaId=${TIENDA}`)).status).toBe(400);
    const r = await request("GET", `/store/reservas/canchas/agenda?tiendaId=${TIENDA}&fecha=2026-10-12`);
    expect(r.status).toBe(200);
    expect(canchasSvc.agendaStore).toHaveBeenCalledWith(TIENDA, "2026-10-12");
  });

  it("cotizar: acepta la duración del turno", async () => {
    const r = await request("POST", "/store/reservas/cotizar", { body: { tiendaId: TIENDA, productoId: PRODUCTO, fecha: "2026-10-12", hora: "19:00", duracionMin: 90 } });
    expect(r.status).toBe(200);
    expect(svc.cotizar).toHaveBeenCalledWith(expect.objectContaining({ hora: "19:00", duracionMin: 90 }));
  });

  it("ficha: valida formato y precios; solo admin+ la guarda", async () => {
    const body = { tiendaId: TIENDA, formato: "F7", jugadoresMax: 16, precioDia: 120, precioNoche: 160 };
    const malo = await request("PUT", `/admin/reservas/canchas/${PRODUCTO}`, { user: "dueno", body: { ...body, formato: "F4", precioNoche: 0 } });
    expect(malo.status).toBe(400);
    expect(Object.keys(malo.json.data.body)).toEqual(expect.arrayContaining(["formato", "precioNoche"]));
    expect((await request("PUT", `/admin/reservas/canchas/${PRODUCTO}`, { user: "recepcion", body })).status).toBe(403);
    expect((await request("PUT", `/admin/reservas/canchas/${PRODUCTO}`, { user: "dueno", body })).status).toBe(200);
    expect(canchasSvc.guardarFichaCancha).toHaveBeenCalledWith(TIENDA, PRODUCTO, expect.objectContaining({ formato: "F7", techada: false }), expect.anything());
  });

  it("bloqueo: el fin debe ser después del inicio (00:00 = medianoche); editor+ bloquea", async () => {
    const body = { tiendaId: TIENDA, productoId: PRODUCTO, fecha: "2026-10-12", horaInicio: "20:00" };
    expect((await request("POST", "/admin/reservas/canchas/bloqueos", { user: "recepcion", body: { ...body, horaFin: "19:00" } })).status).toBe(400);
    expect((await request("POST", "/admin/reservas/canchas/bloqueos", { user: "visor", body: { ...body, horaFin: "21:00" } })).status).toBe(403);
    expect((await request("POST", "/admin/reservas/canchas/bloqueos", { user: "recepcion", body: { ...body, horaFin: "00:00", motivo: "Academia" } })).status).toBe(200);
    expect(canchasSvc.crearBloqueo).toHaveBeenCalledWith(TIENDA, expect.objectContaining({ horaFin: "00:00", motivo: "Academia" }), expect.anything());
  });

  it("config: horario en horas en punto y cierre después de la apertura", async () => {
    const r = await request("PUT", "/admin/reservas/config", {
      user: "dueno", body: { tiendaId: TIENDA, canchaApertura: "08:30", canchaCierre: "07:00", canchaDuraciones: [45] }
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.data.body)).toEqual(expect.arrayContaining(["canchaApertura"]));
    const ok = await request("PUT", "/admin/reservas/config", {
      user: "dueno", body: { tiendaId: TIENDA, canchaApertura: "08:00", canchaCierre: "00:00", canchaInicioNoche: "18:00", canchaDuraciones: [120, 60] }
    });
    expect(ok.status).toBe(200);
    expect(configSvc.guardarConfig).toHaveBeenCalledWith(TIENDA, expect.objectContaining({ canchaDuraciones: [60, 120] }), expect.anything());
  });
});

describe("ciclo de la reserva del hotel (ciclo-reserva-hotel)", () => {
  const titularDni = { nombres: "Luis", apellidos: "Quispe", docTipo: "DNI", docNumero: "70221346" };

  it("check-in: valida el documento de cada acompañante y solo editor+", async () => {
    const malo = await request("POST", `/admin/reservas/${PEDIDO}/check-in`, { user: "recepcion", body: { tiendaId: TIENDA, acompanantes: [{ ...titularDni, docNumero: "12" }] } });
    expect(malo.status).toBe(400);
    expect((await request("POST", `/admin/reservas/${PEDIDO}/check-in`, { user: "visor", body: { tiendaId: TIENDA } })).status).toBe(403);
    const r = await request("POST", `/admin/reservas/${PEDIDO}/check-in`, {
      user: "recepcion", body: { tiendaId: TIENDA, acompanantes: [titularDni], hora: "14:20", cobro: { formaPago: "transferencia", comprobante: "boleta" } }
    });
    expect(r.status).toBe(200);
    expect(cicloSvc.registrarCheckin).toHaveBeenCalledWith(TIENDA, PEDIDO, expect.objectContaining({ hora: "14:20", acompanantes: [titularDni] }), expect.anything());
  });

  it("check-out: forma de pago y comprobante válidos", async () => {
    expect((await request("POST", `/admin/reservas/${PEDIDO}/check-out`, { user: "recepcion", body: { tiendaId: TIENDA, formaPago: "cheque" } })).status).toBe(400);
    expect((await request("POST", `/admin/reservas/${PEDIDO}/check-out`, { user: "recepcion", body: { tiendaId: TIENDA, formaPago: "efectivo", comprobante: "factura" } })).status).toBe(200);
  });

  it("código PMS y notas", async () => {
    expect((await request("PUT", `/admin/reservas/${PEDIDO}/codigo-pms`, { user: "recepcion", body: { tiendaId: TIENDA, codigo: "x".repeat(41) } })).status).toBe(400);
    expect((await request("PUT", `/admin/reservas/${PEDIDO}/codigo-pms`, { user: "recepcion", body: { tiendaId: TIENDA, codigo: " NB-20431 " } })).status).toBe(200);
    expect(cicloSvc.guardarCodigoPms).toHaveBeenCalledWith(TIENDA, PEDIDO, { tiendaId: TIENDA, codigo: "NB-20431" }, expect.anything());
    expect((await request("POST", `/admin/reservas/${PEDIDO}/notas`, { user: "recepcion", body: { tiendaId: TIENDA, texto: "  " } })).status).toBe(400);
    expect((await request("POST", `/admin/reservas/${PEDIDO}/notas`, { user: "recepcion", body: { tiendaId: TIENDA, texto: "Pidió cuna" } })).status).toBe(200);
  });

  it("bandeja: filtros del hotel y resumen de hoy", async () => {
    const r = await request("GET", `/admin/reservas?tiendaId=${TIENDA}&estadoHotel=ocupada&sinPms=true`, { user: "visor" });
    expect(r.status).toBe(200);
    expect(svc.listarReservasAdmin).toHaveBeenLastCalledWith(TIENDA, expect.objectContaining({ estadoHotel: "ocupada", sinPms: true, conNotas: false }));
    expect((await request("GET", `/admin/reservas?tiendaId=${TIENDA}&estadoHotel=hospedada`, { user: "visor" })).status).toBe(400);
    expect((await request("GET", `/admin/reservas/resumen-hotel?tiendaId=${TIENDA}`, { user: "visor" })).status).toBe(200);
  });
});

describe("cambios, cancelación y early/late del hotel (ciclo-reserva-hotel C3-C7)", () => {
  const url = (accion) => `/admin/reservas/${PEDIDO}/${accion}`;

  it("modificar: solo lo que cambia, con noches y adultos válidos", async () => {
    expect((await request("PUT", url("estadia"), { user: "recepcion", body: { tiendaId: TIENDA, noches: 0 } })).status).toBe(400);
    expect((await request("PUT", url("estadia"), { user: "recepcion", body: { tiendaId: TIENDA, fecha: "2026-10-20", noches: 3 } })).status).toBe(200);
    expect(cicloSvc.modificarReserva).toHaveBeenCalledWith(TIENDA, PEDIDO, { fecha: "2026-10-20", noches: 3 }, expect.anything());
  });

  it("cambiar salida pide una fecha", async () => {
    expect((await request("POST", url("cambiar-salida"), { user: "recepcion", body: { tiendaId: TIENDA, fechaSalida: "19/10" } })).status).toBe(400);
    expect((await request("POST", url("cambiar-salida"), { user: "recepcion", body: { tiendaId: TIENDA, fechaSalida: "2026-10-19" } })).status).toBe(200);
  });

  it("cancelar: quién y motivo", async () => {
    expect((await request("POST", url("cancelar-hotel"), { user: "recepcion", body: { tiendaId: TIENDA, quien: "agencia", motivo: "x" } })).status).toBe(400);
    expect((await request("POST", url("cancelar-hotel"), { user: "recepcion", body: { tiendaId: TIENDA, quien: "huesped", motivo: "Vuelo cancelado" } })).status).toBe(200);
    expect((await request("POST", url("no-llego"), { user: "recepcion", body: { tiendaId: TIENDA } })).status).toBe(200);
  });

  it("early/late: responder con el id del extra y salida tardía con hora y precio", async () => {
    expect((await request("POST", url("horario"), { user: "recepcion", body: { tiendaId: TIENDA, extraId: "x", aprobar: true } })).status).toBe(400);
    expect((await request("POST", url("horario"), { user: "recepcion", body: { tiendaId: TIENDA, extraId: PRODUCTO, aprobar: false } })).status).toBe(200);
    expect((await request("POST", url("salida-tardia"), { user: "recepcion", body: { tiendaId: TIENDA, hora: "16:00", precio: -1 } })).status).toBe(400);
    expect((await request("POST", url("salida-tardia"), { user: "recepcion", body: { tiendaId: TIENDA, hora: "16:00", precio: 100 } })).status).toBe(200);
    expect(cicloSvc.darSalidaTardia).toHaveBeenCalledWith(TIENDA, PEDIDO, { tiendaId: TIENDA, hora: "16:00", precio: 100 }, expect.anything());
  });
});
