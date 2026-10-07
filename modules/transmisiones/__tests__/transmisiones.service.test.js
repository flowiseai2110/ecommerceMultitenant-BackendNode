import { jest } from "@jest/globals";

// Reglas del servicio con la BD simulada: tipo de negocio, duración, tope de
// invitados y validez del enlace del invitado. El token SÍ es real.
process.env.TRANSMISIONES_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
process.env.PAGOS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.STOREFRONT_URL = "https://tienda.test";
delete process.env.PLATFORM_BASE_DOMAIN;

const TIENDA = "22222222-2222-4222-8222-222222222222";
const OTRA = "33333333-3333-4333-8333-333333333333";
const FUNCION = "44444444-4444-4444-8444-444444444444";
const TRANSMISION = "55555555-5555-4555-8555-555555555555";
const INV = "66666666-6666-4666-8666-666666666666";

const PrismaStub = { PrismaClientKnownRequestError: class extends Error {}, PrismaClientValidationError: class extends Error {} };
const prisma = {
  tiendas: { findUnique: jest.fn() },
  evento_funciones: { findFirst: jest.fn() },
  evento_transmisiones: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  evento_invitaciones: { createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  tienda_uso_recursos: { findUnique: jest.fn(), upsert: jest.fn() },
  transmision_eventos_proveedor: { create: jest.fn() },
  transmision_vinculaciones: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() }
};
prisma.$transaction = jest.fn(async (fn) => fn(prisma));

// Proveedor de video falso: nada sale a Cloudflare.
const proveedor = {
  nombre: "cloudflare",
  crearEntrada: jest.fn(async () => ({})),
  habilitarEntrada: jest.fn(async () => {}),
  estadoEntrada: jest.fn(async () => ({ senal: "desconectada" })),
  borrarEntrada: jest.fn(async () => {}),
  borrarVideos: jest.fn(async () => 0),
  urlReproduccion: jest.fn(async (id) => ({ iframeUrl: `https://cf.test/${id}/iframe`, expiraEn: new Date() })),
  verificarWebhook: jest.fn()
};
jest.unstable_mockModule("../../../services/streaming/index.js", () => ({ getStreamingProvider: () => proveedor }));
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: PrismaStub, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: PrismaStub, default: prisma }));

const svc = await import("../transmisiones.service.js");
const { firmarTokenInvitacion } = await import("../transmisiones.token.js");

const ahora = new Date("2026-10-10T12:00:00-05:00");
const inicio = new Date("2026-10-17T16:00:00-05:00");
const tienda = { id: TIENDA, slug: "fiestas-mateo", nombre: "Fiestas Mateo", logoUrl: null, tipoNegocio: "eventos" };
const evento = { privado: true, lugar: "Local Los Olivos", producto: { nombre: "Cumpleaños de Mateo", imagenes: [] } };
const funcionBase = (extra = {}) => ({ id: FUNCION, tiendaId: TIENDA, nombre: null, inicio, fin: null, activa: true, evento, transmision: null, ...extra });
const transmisionBase = (extra = {}) => ({
  id: TRANSMISION, tiendaId: TIENDA, funcionId: FUNCION, plan: "basico", estado: "programada", duracionMin: 180,
  youtubeVideoId: "dQw4w9WgXcQ", anfitrionNombre: "Carla", anfitrionEmail: null, consentimientoEn: ahora, consentimientoPor: "a@b.c",
  invitaciones: [], ...extra
});
const datos = { plan: "basico", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", duracionMin: null, anfitrionNombre: "Carla Pérez", anfitrionEmail: null };
const user = { id: "u1", email: "dueno@test.com" };

beforeEach(() => {
  for (const modelo of Object.values(prisma)) if (typeof modelo === "object") for (const fn of Object.values(modelo)) fn.mockReset();
  for (const fn of Object.values(proveedor)) if (typeof fn === "function" && fn.mockClear) fn.mockClear();
  prisma.tiendas.findUnique.mockResolvedValue(tienda);
  prisma.evento_transmisiones.findMany.mockResolvedValue([]);
  prisma.tienda_uso_recursos.findUnique.mockResolvedValue(null);
});

describe("activar (R1)", () => {
  it("solo para negocios de eventos", async () => {
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, tipoNegocio: "hotel" });
    await expect(svc.activar(TIENDA, FUNCION, datos, user, ahora)).rejects.toMatchObject({ statusCode: 422, details: { motivo: "TIPO_NEGOCIO" } });
  });

  it("sin hora de fin pide la duración; con ella crea con consentimiento y el id de YouTube", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcionBase());
    await expect(svc.activar(TIENDA, FUNCION, datos, user, ahora)).rejects.toMatchObject({ details: { motivo: "DURACION_REQUERIDA" } });

    await svc.activar(TIENDA, FUNCION, { ...datos, duracionMin: 180 }, user, ahora).catch(() => {});
    expect(prisma.evento_transmisiones.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tiendaId: TIENDA, funcionId: FUNCION, plan: "basico", duracionMin: 180, youtubeVideoId: "dQw4w9WgXcQ",
        anfitrionNombre: "Carla Pérez", consentimientoEn: ahora, consentimientoPor: "dueno@test.com"
      })
    });
  });

  it("con hora de fin, la duración sale de la función", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcionBase({ fin: new Date("2026-10-17T19:30:00-05:00") }));
    await svc.activar(TIENDA, FUNCION, { ...datos, duracionMin: 30 }, user, ahora).catch(() => {});
    expect(prisma.evento_transmisiones.create.mock.calls[0][0].data.duracionMin).toBe(210);
  });

  it("rechaza una función que ya tiene transmisión o que ya terminó", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcionBase({ transmision: transmisionBase() }));
    await expect(svc.activar(TIENDA, FUNCION, datos, user, ahora)).rejects.toMatchObject({ statusCode: 409 });

    prisma.evento_funciones.findFirst.mockResolvedValue(funcionBase({ inicio: new Date("2026-10-01T16:00:00-05:00"), fin: new Date("2026-10-01T18:00:00-05:00") }));
    await expect(svc.activar(TIENDA, FUNCION, datos, user, ahora)).rejects.toMatchObject({ details: { motivo: "FUNCION_PASADA" } });
    expect(prisma.evento_transmisiones.create).not.toHaveBeenCalled();
  });
});

describe("invitados (R3)", () => {
  it("no deja pasar el tope del plan", async () => {
    const activas = Array.from({ length: 299 }, (_, i) => ({ id: `i${i}`, estado: "activa" }));
    prisma.evento_transmisiones.findFirst.mockResolvedValue(transmisionBase({ funcion: funcionBase(), invitaciones: activas }));
    await expect(svc.agregarInvitados(TIENDA, TRANSMISION, [{ nombre: "A" }, { nombre: "B" }], user, ahora))
      .rejects.toMatchObject({ details: { motivo: "TOPE_INVITADOS", message: "Esta transmisión permite 300 invitados. Puedes agregar 1 más" } });
    expect(prisma.evento_invitaciones.createMany).not.toHaveBeenCalled();
  });

  it("cada invitación activa trae su enlace firmado y el WhatsApp ya escrito", async () => {
    const inv = { id: INV, tiendaId: TIENDA, nombre: "Tía Rosa", telefono: "987654321", estado: "activa", version: 1 };
    prisma.evento_funciones.findFirst.mockResolvedValue(funcionBase({ transmision: transmisionBase({ invitaciones: [inv, { ...inv, id: "x", estado: "anulada" }] }) }));
    const r = await svc.obtenerPorFuncion(TIENDA, FUNCION, ahora);
    const [activa, anulada] = r.transmision.invitaciones;
    // Con PLATFORM_BASE_DOMAIN (el .env lo puede traer) el enlace va por subdominio.
    expect(activa.enlace).toMatch(/^https:\/\/(fiestas-mateo\.[^/]+|tienda\.test\/fiestas-mateo)\/t\/ey/);
    expect(activa.whatsappUrl).toMatch(/^https:\/\/wa\.me\/51987654321\?text=Hola%20T%C3%ADa%20Rosa/);
    expect(anulada.enlace).toBeNull();
    expect(r.transmision).toMatchObject({ etapa: "proxima", tope: 300, activas: 1, duracionEditable: true, envivo: null, youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });
});

describe("página del invitado (R4)", () => {
  const invitacion = (extra = {}) => ({
    id: INV, tiendaId: TIENDA, nombre: "Tía Rosa", estado: "activa", version: 2, primeraConexionEn: null,
    transmision: transmisionBase({ funcion: funcionBase() }), ...extra
  });
  const token = (version = 2, tiendaId = TIENDA) => firmarTokenInvitacion({ invitacionId: INV, tiendaId, version });

  beforeEach(() => prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas Mateo", logoUrl: null }));

  it("antes de la sala: datos y cuenta regresiva, sin video; registra la conexión", async () => {
    prisma.evento_invitaciones.findFirst.mockResolvedValue(invitacion());
    const r = await svc.paginaInvitado(await token(), TIENDA, ahora);
    expect(r).toMatchObject({ invitado: { nombre: "Tía Rosa" }, etapa: "proxima", video: null, evento: { nombre: "Cumpleaños de Mateo" } });
    expect(prisma.evento_invitaciones.update).toHaveBeenCalledWith({ where: { id: INV }, data: { ultimaConexionEn: ahora, primeraConexionEn: ahora } });
  });

  it("en vivo entrega el video", async () => {
    prisma.evento_invitaciones.findFirst.mockResolvedValue(invitacion());
    const r = await svc.paginaInvitado(await token(), null, new Date("2026-10-17T17:00:00-05:00"));
    expect(r).toMatchObject({ etapa: "en_vivo", video: { proveedor: "youtube", id: "dQw4w9WgXcQ" } });
  });

  it.each([
    ["un enlace regenerado (versión vieja)", () => invitacion(), 1, TIENDA],
    ["una invitación anulada", () => invitacion({ estado: "anulada" }), 2, TIENDA],
    ["el enlace abierto en otra tienda", () => invitacion(), 2, OTRA]
  ])("404 para %s", async (_, inv, version, tiendaResuelta) => {
    prisma.evento_invitaciones.findFirst.mockResolvedValue(inv());
    await expect(svc.paginaInvitado(await token(version), tiendaResuelta, ahora)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.evento_invitaciones.update).not.toHaveBeenCalled();
  });

  it("404 para un token alterado", async () => {
    await expect(svc.paginaInvitado(`${await token()}x`, null, ahora)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ============================================
// Fase 2: plan Privado (Cloudflare simulado)
// ============================================

const envivo = await import("../transmisiones.envivo.js");
const { decryptSecret, encryptSecret } = await import("../../../utils/crypto.js");
const { Prisma } = await import("../../../config/prisma.js");

const conexion = { rtmpsUrl: "rtmps://live.test:443/live/", streamKey: "clave-secreta", srtUrl: "srt://live.test:778", srtStreamId: "sid", srtPassphrase: "pp" };
const privadoBase = (extra = {}) => transmisionBase({
  plan: "privado", youtubeVideoId: null, proveedor: "cloudflare", entradaId: "in-1", maxInvitados: 50, factor: 1,
  habilitada: false, senal: "sin_senal", senalEn: null, inicioRealEn: null, terminadaEn: null, pruebaHasta: null, claveVersion: 1, ...extra
});
const datosPrivado = { plan: "privado", maxInvitados: 50, youtubeUrl: null, duracionMin: null, anfitrionNombre: "Carla Pérez", anfitrionEmail: null };
const funcion3h = (extra = {}) => funcionBase({ fin: new Date("2026-10-17T19:00:00-05:00"), ...extra });

describe("activar Privado (R1.3, R1.4, R1.5)", () => {
  beforeEach(() => proveedor.crearEntrada.mockResolvedValue({ entradaId: "in-nueva", conexion }));

  it("exige un evento privado", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h({ evento: { ...evento, privado: false } }));
    await expect(svc.activar(TIENDA, FUNCION, datosPrivado, user, ahora)).rejects.toMatchObject({ details: { motivo: "EVENTO_PUBLICO" } });
  });

  it("sin horas suficientes no activa y dice cuánto falta", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h());
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 3 } });
    prisma.tienda_uso_recursos.findUnique.mockResolvedValue({ cantidadUsada: 60 });
    const error = await svc.activar(TIENDA, FUNCION, datosPrivado, user, ahora).catch(e => e);
    expect(error.details).toMatchObject({ motivo: "HORAS_INSUFICIENTES", necesariosMin: 180, disponiblesMin: 120 });
    expect(error.details.message).toBe("Esta transmisión usará 3 h de tu paquete y te quedan 2 h este mes. Te faltan 1 h: escríbenos para comprar un paquete de horas o elige menos invitados.");
    expect(proveedor.crearEntrada).not.toHaveBeenCalled();
  });

  it("cuenta como reservadas las otras transmisiones del mes", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h());
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    prisma.evento_transmisiones.findMany.mockResolvedValue([{ duracionMin: 120, factor: 2, funcion: { inicio: new Date("2026-10-24T16:00:00-05:00"), fin: null } }]);
    // 6 h incluidas − 4 h reservadas (2 h × factor 2) = 2 h; este evento (3 h × 1) necesita 3 h.
    await expect(svc.activar(TIENDA, FUNCION, datosPrivado, user, ahora)).rejects.toMatchObject({ details: { disponiblesMin: 120, necesariosMin: 180 } });
  });

  it("con horas, crea la entrada deshabilitada y guarda la clave cifrada", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h());
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    await svc.activar(TIENDA, FUNCION, { ...datosPrivado, maxInvitados: 100 }, user, ahora).catch(() => {});
    expect(proveedor.crearEntrada).toHaveBeenCalledWith(expect.objectContaining({ habilitada: false, meta: expect.objectContaining({ tiendaId: TIENDA }) }));
    const data = prisma.evento_transmisiones.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: "privado", entradaId: "in-nueva", maxInvitados: 100, factor: 2, habilitada: false });
    expect(data.claveCifrada).not.toContain("clave-secreta");
    expect(JSON.parse(decryptSecret(data.claveCifrada)).streamKey).toBe("clave-secreta");
  });

  it("si la BD falla, borra la entrada del proveedor", async () => {
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h());
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    prisma.evento_transmisiones.create.mockRejectedValue(new Error("BD caída"));
    await expect(svc.activar(TIENDA, FUNCION, datosPrivado, user, ahora)).rejects.toThrow("BD caída");
    expect(proveedor.borrarEntrada).toHaveBeenCalledWith("in-nueva");
  });
});

describe("terminar y corte (R6.3, R7.1, R7.8)", () => {
  const t = (extra = {}) => privadoBase({ funcion: funcion3h(), factor: 2, inicioRealEn: new Date("2026-10-17T16:05:00-05:00"), ...extra });
  const alas = new Date("2026-10-17T17:05:00-05:00");

  it("corta la señal, mide lo transmitido y lo descuenta una sola vez", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await envivo.terminarTransmision(t(), { motivo: "admin", ahora: alas })).toBe(true);
    expect(proveedor.habilitarEntrada).toHaveBeenCalledWith("in-1", false);
    expect(prisma.evento_transmisiones.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: TRANSMISION, terminadaEn: null }, data: { minutosUsados: 60, minutosDescontados: 120 }
    });
    expect(prisma.tienda_uso_recursos.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { uq_tienda_recurso_periodo: { tiendaId: TIENDA, recurso: "transmision_minutos", periodo: "2026-10" } },
      update: expect.objectContaining({ cantidadUsada: { increment: 120 } })
    }));
    expect(proveedor.borrarEntrada).toHaveBeenCalledWith("in-1");

    // Otra réplica o un doble clic: ya estaba terminada, no descuenta otra vez.
    expect(await envivo.terminarTransmision(t(), { motivo: "corte", ahora: alas })).toBe(false);
    expect(prisma.tienda_uso_recursos.upsert).toHaveBeenCalledTimes(1);
  });

  it("si la señal ya se había caído, cuenta hasta la caída", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    await envivo.terminarTransmision(t({ senal: "desconectada", senalEn: new Date("2026-10-17T16:35:00-05:00") }), { motivo: "corte", ahora: alas });
    expect(prisma.evento_transmisiones.updateMany.mock.calls[0][0].data).toMatchObject({ minutosUsados: 30, minutosDescontados: 60 });
  });

  it("sin señal nunca, no descuenta nada", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    await envivo.terminarTransmision(t({ inicioRealEn: null }), { motivo: "corte", ahora: alas });
    expect(prisma.tienda_uso_recursos.upsert).not.toHaveBeenCalled();
  });

  it("el job corta a los 5 min del fin y habilita la entrada al abrir la sala", async () => {
    const vencida = privadoBase({ id: "t-vencida", funcion: funcion3h(), habilitada: true });
    const porAbrir = privadoBase({ id: "t-sala", funcion: funcion3h({ inicio: new Date("2026-10-17T19:30:00-05:00"), fin: new Date("2026-10-17T21:00:00-05:00") }) });
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([vencida, porAbrir]).mockResolvedValueOnce([]);
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    prisma.evento_transmisiones.update.mockImplementation(async ({ data }) => ({ ...porAbrir, ...data }));
    proveedor.estadoEntrada.mockResolvedValue({ senal: "conectada" });

    await envivo.cicloTransmisiones(new Date("2026-10-17T19:05:00-05:00"));
    expect(prisma.evento_transmisiones.updateMany.mock.calls[0][0].where.id).toBe("t-vencida");
    expect(proveedor.habilitarEntrada).toHaveBeenCalledWith("in-1", true);
    // Ya en la sala y con señal: marca el inicio real.
    expect(prisma.evento_transmisiones.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senal: "conectada", inicioRealEn: new Date("2026-10-17T19:05:00-05:00") })
    }));
  });
});

describe("sesión única del invitado (R4.3)", () => {
  const inv = (extra = {}) => ({
    id: INV, tiendaId: TIENDA, nombre: "Tía Rosa", estado: "activa", version: 1, sesionId: "pestana-uno",
    transmision: privadoBase({ funcion: funcionBase() }), ...extra
  });
  const token = () => firmarTokenInvitacion({ invitacionId: INV, tiendaId: TIENDA, version: 1 });

  it("el dispositivo anterior recibe 409; el que reclama se queda con la sesión", async () => {
    prisma.evento_invitaciones.findFirst.mockResolvedValue(inv());
    await expect(svc.latidoInvitado(await token(), null, { sesionId: "pestana-dos", reclamar: false }, ahora))
      .rejects.toMatchObject({ statusCode: 409, details: { motivo: "OTRO_DISPOSITIVO", message: "Este enlace se abrió en otro dispositivo" } });

    const r = await svc.latidoInvitado(await token(), null, { sesionId: "pestana-dos", reclamar: true }, ahora);
    expect(prisma.evento_invitaciones.update).toHaveBeenCalledWith({ where: { id: INV }, data: { sesionId: "pestana-dos", sesionVistaEn: ahora } });
    expect(r).toMatchObject({ etapa: "proxima", senal: "sin_senal" });
  });

  it("el video del Privado es un iframe firmado de la entrada, solo con la sala abierta", async () => {
    prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas Mateo", logoUrl: null });
    prisma.evento_invitaciones.findFirst.mockResolvedValue(inv());
    const antes = await svc.paginaInvitado(await token(), null, ahora);
    expect(antes).toMatchObject({ video: null, sesionUnica: true });
    const enVivo = await svc.paginaInvitado(await token(), null, new Date("2026-10-17T17:00:00-05:00"));
    expect(enVivo.video).toEqual({ proveedor: "cloudflare", iframeUrl: "https://cf.test/in-1/iframe" });
  });
});

describe("webhooks del proveedor (R6.2, R10.2)", () => {
  const evt = { eventoId: "live_input.connected:in-1:x", tipo: "live_input.connected", entradaId: "in-1", senal: "conectada", payload: {} };
  const req = { tipo: "notificaciones", headers: {}, rawBody: Buffer.from("{}") };

  it("firma inválida: no registra nada", async () => {
    proveedor.verificarWebhook.mockReturnValue(null);
    expect(await envivo.procesarWebhook(req)).toEqual({ valido: false });
    expect(prisma.transmision_eventos_proveedor.create).not.toHaveBeenCalled();
  });

  it("un aviso repetido no se procesa dos veces", async () => {
    proveedor.verificarWebhook.mockReturnValue(evt);
    prisma.transmision_eventos_proveedor.create.mockRejectedValue(Object.assign(new Prisma.PrismaClientKnownRequestError("dup"), { code: "P2002" }));
    expect(await envivo.procesarWebhook(req)).toEqual({ valido: true, duplicado: true });
    expect(prisma.evento_transmisiones.findFirst).not.toHaveBeenCalled();
  });

  it("conectado aplica la señal a la transmisión de esa entrada", async () => {
    proveedor.verificarWebhook.mockReturnValue(evt);
    prisma.evento_transmisiones.findFirst.mockResolvedValue(privadoBase({ funcion: funcion3h() }));
    await envivo.procesarWebhook(req, new Date("2026-10-17T15:30:00-05:00"));
    expect(prisma.evento_transmisiones.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senal: "conectada", inicioRealEn: new Date("2026-10-17T15:30:00-05:00") })
    }));
  });
});

describe("App Transmitir (R11)", () => {
  it("el QR se canjea una sola vez y entrega los datos de conexión", async () => {
    prisma.transmision_vinculaciones.findUnique.mockResolvedValue({ id: "v1", tiendaId: TIENDA, transmisionId: TRANSMISION, venceEn: new Date(ahora.getTime() + 60000), usadoEn: null });
    prisma.transmision_vinculaciones.updateMany.mockResolvedValue({ count: 1 });
    prisma.evento_transmisiones.findFirst.mockResolvedValue(privadoBase({ funcion: funcionBase(), claveCifrada: encryptSecret(JSON.stringify(conexion)) }));
    prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas Mateo", logoUrl: null });

    const r = await svc.vincularApp("codigo-de-prueba-largo-123", ahora);
    expect(r.conexion.urlCompleta).toBe("rtmps://live.test:443/live/clave-secreta");
    expect(r.token).toMatch(/^ey/);

    // Con la clave regenerada (claveVersion 2), la sesión de la app deja de servir (R11.9).
    prisma.evento_transmisiones.findFirst.mockResolvedValue(privadoBase({ funcion: funcionBase(), claveVersion: 2, invitaciones: [] }));
    await expect(svc.estadoApp(r.token, ahora)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("un código usado o vencido no sirve", async () => {
    prisma.transmision_vinculaciones.findUnique.mockResolvedValue({ id: "v1", venceEn: new Date(ahora.getTime() - 1), usadoEn: null });
    await expect(svc.vincularApp("codigo-de-prueba-largo-123", ahora)).rejects.toMatchObject({ statusCode: 401 });
  });
});
