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
  evento_transmisiones: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  evento_invitaciones: { createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  tienda_uso_recursos: { findUnique: jest.fn(), upsert: jest.fn() },
  transmision_eventos_proveedor: { create: jest.fn() },
  transmision_vinculaciones: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  transmision_movimientos: { groupBy: jest.fn(), aggregate: jest.fn(), createMany: jest.fn() },
  transmision_paquetes: { findMany: jest.fn(), update: jest.fn() },
  transmision_excedentes: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  transmision_grabaciones: { createMany: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  transmision_cargos: { upsert: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  transmision_destinos: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() }
};
prisma.$queryRaw = jest.fn(async () => []);
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
  borrarSoloEntrada: jest.fn(async () => {}),
  listarVideos: jest.fn(async () => []),
  estadoVideo: jest.fn(async (id) => ({ id, estado: "lista", duracionSeg: 600, creadoEn: new Date() })),
  borrarVideo: jest.fn(async () => {}),
  pedirDescarga: jest.fn(async () => "pendiente"),
  estadoDescarga: jest.fn(async () => "lista"),
  urlDescarga: jest.fn(async (id, { nombreArchivo }) => `https://cf.test/${id}/downloads/default.mp4?filename=${nombreArchivo}`),
  crearSalida: jest.fn(async () => "salida-1"),
  habilitarSalida: jest.fn(async () => {}),
  borrarSalida: jest.fn(async () => {}),
  pedirSubtitulos: jest.fn(async () => {}),
  estadoSubtitulos: jest.fn(async () => "listo"),
  leerSubtitulos: jest.fn(async () => "WEBVTT"),
  verificarWebhook: jest.fn()
};
jest.unstable_mockModule("../../../services/streaming/index.js", () => ({ getStreamingProvider: () => proveedor }));
// Sin correos reales: el aviso de los 15 minutos se verifica con el mock.
// Objeto compartido: el test y el código ven las mismas funciones (la fábrica puede correr más de una vez).
const correo = {
  sendTransmisionAvisoFinEmail: jest.fn(async () => ({ success: true })),
  sendTransmisionGrabacionEmail: jest.fn(async () => ({ success: true })),
  escapeHtml: (v) => String(v),
  default: {}
};
jest.unstable_mockModule("../../../services/email.service.js", () => correo);
// Sin R2 real: la copia de "Guardar 1 año" y las descargas se verifican con el mock.
const r2 = {
  subirPrivado: jest.fn(async () => {}),
  urlPrivada: jest.fn(async (key) => `https://r2.test/${key}?firmado`),
  borrarPrivado: jest.fn(async () => {})
};
jest.unstable_mockModule("../../../services/storage-privado.service.js", () => r2);
// Sin llamadas reales a Claude: el resumen se verifica con el mock.
const ia = { generarResumen: jest.fn(async () => ({ resultado: { resumen: "Fue lindo", capitulos: [], momentos: [] }, sinAudio: false, tokensEntrada: 10, tokensSalida: 5 })) };
jest.unstable_mockModule("../transmisiones.resumen.js", () => ia);
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
  prisma.transmision_movimientos.groupBy.mockResolvedValue([]);
  prisma.transmision_movimientos.aggregate.mockResolvedValue({ _sum: { minutos: null } });
  prisma.transmision_paquetes.findMany.mockResolvedValue([]);
  prisma.transmision_excedentes.findMany.mockResolvedValue([]);
  prisma.transmision_excedentes.findUnique.mockResolvedValue(null);
  prisma.$queryRaw.mockResolvedValue([]);
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
    prisma.transmision_movimientos.groupBy.mockResolvedValue([{ periodo: "2026-10", _sum: { minutos: 60 } }]);
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

// ============================================
// Fase 3: extensión, excedente y reparto del consumo
// ============================================

describe("extender (R7.5-R7.7)", () => {
  const enVivo = new Date("2026-10-17T18:50:00-05:00");
  const t = (extra = {}) => privadoBase({ funcion: funcion3h(), factor: 2, inicioRealEn: new Date("2026-10-17T16:00:00-05:00"), ...extra });

  it("con horas disponibles extiende sin excedente", async () => {
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    const r = await envivo.extenderTransmision(t(), 30, { quien: "dueno@test.com", ahora: enVivo });
    expect(r).toMatchObject({ minutosPaquete: 60, deHorasMin: 60, excedenteMin: 0, monto: 0 });
    expect(prisma.transmision_excedentes.upsert).not.toHaveBeenCalled();
    expect(prisma.evento_transmisiones.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ extensionMin: { increment: 30 }, avisoFinEn: null })
    }));
  });

  it("sin horas autoriza el excedente con su precio y quién lo confirmó", async () => {
    const r = await envivo.extenderTransmision(t(), 60, { quien: "contacto", ahora: enVivo });
    expect(r).toMatchObject({ minutosPaquete: 120, excedenteMin: 120, monto: 80 });
    expect(prisma.transmision_excedentes.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ minutosAutorizados: 120, autorizadoPor: "contacto", periodo: "2026-10" })
    }));
  });

  it("respeta el tope de 2 h de excedente del mes", async () => {
    prisma.transmision_excedentes.findMany.mockResolvedValue([{ estado: "cobrado", minutos: 90, minutosAutorizados: 90 }]);
    await expect(envivo.extenderTransmision(t(), 30, { quien: "x", ahora: enVivo }))
      .rejects.toMatchObject({ details: { motivo: "EXTENSION_NO_PERMITIDA", message: "No quedan horas y llegaste al tope de excedente del mes" } });
  });

  it("no se extiende una transmisión cortada", async () => {
    await expect(envivo.extenderTransmision(t(), 30, { quien: "x", ahora: new Date("2026-10-17T19:06:00-05:00") }))
      .rejects.toMatchObject({ details: { motivo: "CORTADA" } });
  });
});

describe("reparto al terminar (R7.3, R6.3)", () => {
  const alas = new Date("2026-10-17T19:00:00-05:00");
  const t = (extra = {}) => privadoBase({ funcion: funcion3h(), factor: 1, inicioRealEn: new Date("2026-10-17T16:00:00-05:00"), ...extra });

  it("plan del mes, luego el paquete que vence primero, y cierra el excedente con lo usado", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 1 } });
    prisma.$queryRaw.mockResolvedValue([{ id: "paq-1", restante: 100 }]);
    prisma.transmision_excedentes.findUnique.mockResolvedValue({ id: "exc-1", estado: "autorizado", minutosAutorizados: 60 });

    await envivo.terminarTransmision(t(), { motivo: "corte", ahora: alas });
    // 180 min: 60 del plan, 100 del paquete, 20 de excedente (de 60 autorizados).
    expect(prisma.transmision_movimientos.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ fuente: "plan", minutos: 60 }),
      expect.objectContaining({ fuente: "paquete", paqueteId: "paq-1", minutos: 100 }),
      expect.objectContaining({ fuente: "excedente", minutos: 20 })
    ] });
    expect(prisma.transmision_paquetes.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "paq-1" }, data: expect.objectContaining({ minutosUsados: { increment: 100 } }) }));
    expect(prisma.transmision_excedentes.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "exc-1" }, data: expect.objectContaining({ minutos: 20, monto: 20, estado: "por_cobrar" })
    }));
  });

  it("un excedente confirmado que no se usó queda anulado", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    prisma.transmision_excedentes.findUnique.mockResolvedValue({ id: "exc-1", estado: "autorizado", minutosAutorizados: 60 });
    await envivo.terminarTransmision(t({ inicioRealEn: null }), { motivo: "corte", ahora: alas });
    expect(prisma.transmision_excedentes.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: "anulado" }) }));
  });
});

describe("job: aviso de 15 min y extensión automática", () => {
  it("envía el aviso una sola vez, al negocio y al contacto", async () => {
    const t = privadoBase({ funcion: { ...funcion3h(), evento: { producto: { nombre: "Cumpleaños de Mateo" } } }, habilitada: true, contactoEmail: "tia@test.com" });
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([t]).mockResolvedValue([]);
    prisma.evento_transmisiones.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, email: "negocio@test.com", nombre: "Fiestas Mateo" });
    proveedor.estadoEntrada.mockResolvedValue({ senal: "sin_senal" });

    await envivo.cicloTransmisiones(new Date("2026-10-17T18:46:00-05:00"));
    expect(prisma.evento_transmisiones.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TRANSMISION, avisoFinEn: null } }));
    const { sendTransmisionAvisoFinEmail } = correo;
    expect(sendTransmisionAvisoFinEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ["negocio@test.com", "tia@test.com"], evento: "Cumpleaños de Mateo", minutosRestantes: 14,
      accionUrl: expect.stringMatching(/\/transmision\/accion\/ey/)
    }));
  });

  it("al llegar al fin con extensión automática autorizada, extiende 30 min en vez de cortar", async () => {
    const t = privadoBase({ funcion: funcion3h(), habilitada: true, extensionAutoMaxMin: 60, avisoFinEn: new Date(), noExtender: false, senal: "conectada" });
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([t]).mockResolvedValue([]);
    prisma.evento_transmisiones.findUnique.mockResolvedValue({ ...t, extensionMin: 30, avisoFinEn: null });
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    proveedor.estadoEntrada.mockResolvedValue({ senal: "conectada" });

    await envivo.cicloTransmisiones(new Date("2026-10-17T19:00:00-05:00"));
    expect(prisma.evento_transmisiones.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ extensionMin: { increment: 30 }, usuarioActualizacion: "extensión automática" })
    }));
    expect(prisma.evento_transmisiones.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: TRANSMISION, terminadaEn: null } }));
  });
});

// ============================================
// Fase 4: grabación
// ============================================

const grab = await import("../transmisiones.grabaciones.js");
const { sendTransmisionGrabacionEmail } = correo;

describe("al terminar con grabación (R8.1)", () => {
  const alas = new Date("2026-10-17T19:05:00-05:00");

  it("registra las partes desde la sala (no las de la prueba) y borra SOLO la entrada", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    proveedor.listarVideos.mockResolvedValueOnce([
      { id: "v-prueba", estado: "lista", duracionSeg: 60, creadoEn: new Date("2026-10-16T12:00:00-05:00") },
      { id: "v-2", estado: "procesando", duracionSeg: null, creadoEn: new Date("2026-10-17T17:10:00-05:00") },
      { id: "v-1", estado: "procesando", duracionSeg: null, creadoEn: new Date("2026-10-17T15:55:00-05:00") }
    ]);
    await envivo.terminarTransmision(privadoBase({ funcion: funcion3h(), grabar: true, inicioRealEn: new Date("2026-10-17T16:00:00-05:00") }), { motivo: "corte", ahora: alas });

    expect(prisma.transmision_grabaciones.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ videoId: "v-1", orden: 1 }), expect.objectContaining({ videoId: "v-2", orden: 2 })],
      skipDuplicates: true
    });
    expect(proveedor.borrarSoloEntrada).toHaveBeenCalledWith("in-1");
    expect(proveedor.borrarEntrada).not.toHaveBeenCalled();
  });

  it("\"Solo en vivo\" borra videos y entrada", async () => {
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    await envivo.terminarTransmision(privadoBase({ funcion: funcion3h(), grabar: false }), { motivo: "corte", ahora: alas });
    expect(proveedor.borrarEntrada).toHaveBeenCalledWith("in-1");
    expect(prisma.transmision_grabaciones.createMany).not.toHaveBeenCalled();
  });
});

describe("ciclo de grabaciones", () => {
  const ahora = new Date("2026-10-17T20:00:00-05:00");
  const parte = (extra = {}) => ({ id: "g1", videoId: "v-1", orden: 1, estado: "procesando", mp4Estado: "sin_pedir", r2Key: null, ...extra });
  const tGrab = (extra = {}) => privadoBase({
    funcion: { ...funcion3h(), evento: { producto: { nombre: "Cumpleaños de Mateo" } } }, grabar: true, guardarAnio: false,
    terminadaEn: new Date("2026-10-17T19:05:00-05:00"), limpiadaEn: new Date("2026-10-17T19:05:00-05:00"),
    avisoGrabacionEn: null, avisoBorradoEn: null, avisoDescargaEn: null, grabacionBorradaEn: null, anfitrionEmail: "carla@test.com", ...extra
  });

  beforeEach(() => {
    prisma.transmision_grabaciones.findMany.mockResolvedValue([]);
    prisma.evento_transmisiones.findMany.mockResolvedValue([]);
  });

  it("una parte lista pasa a lista; un parpadeo de menos de 10 s se borra", async () => {
    prisma.transmision_grabaciones.findMany.mockResolvedValueOnce([parte(), parte({ id: "g2", videoId: "v-corto" })]);
    proveedor.estadoVideo.mockImplementation(async (id) => ({ id, estado: "lista", duracionSeg: id === "v-corto" ? 4 : 3600 }));
    await grab.cicloGrabaciones(ahora);
    expect(prisma.transmision_grabaciones.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g1" }, data: expect.objectContaining({ estado: "lista", duracionSeg: 3600 }) }));
    expect(proveedor.borrarVideo).toHaveBeenCalledWith("v-corto");
    proveedor.estadoVideo.mockImplementation(async (id) => ({ id, estado: "lista", duracionSeg: 600, creadoEn: new Date() }));
  });

  it("pide el MP4 de una parte lista", async () => {
    prisma.transmision_grabaciones.findMany.mockResolvedValueOnce([parte({ estado: "lista" })]);
    await grab.cicloGrabaciones(ahora);
    expect(proveedor.pedirDescarga).toHaveBeenCalledWith("v-1");
    expect(prisma.transmision_grabaciones.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mp4Estado: "pendiente" }) }));
  });

  it("con todo listo avisa al anfitrión una sola vez, con su enlace", async () => {
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([tGrab({ grabaciones: [parte({ estado: "lista", mp4Estado: "lista" })] })]);
    prisma.evento_transmisiones.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas Mateo", email: "negocio@test.com", slug: "fiestas-mateo" });
    await grab.cicloGrabaciones(ahora);
    expect(sendTransmisionGrabacionEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ["carla@test.com", "negocio@test.com"], tipo: "lista", evento: "Cumpleaños de Mateo", enlace: expect.stringMatching(/\/grabacion\/ey/)
    }));
  });

  it("al vencer el plazo en línea borra en Cloudflare; con \"Guardar 1 año\" conserva lo que aún no se copió a R2", async () => {
    const vencido = new Date("2026-11-17T00:00:00-05:00");
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([tGrab({
      avisoGrabacionEn: ahora, avisoBorradoEn: ahora, guardarAnio: true, avisoDescargaEn: null,
      grabaciones: [parte({ estado: "lista", mp4Estado: "lista", r2Key: "k1" }), parte({ id: "g2", videoId: "v-2", estado: "lista", mp4Estado: "lista" })]
    })]);
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, body: null, headers: new Map() }));
    await grab.cicloGrabaciones(vencido);
    expect(proveedor.borrarVideo).toHaveBeenCalledWith("v-1");
    expect(proveedor.borrarVideo).not.toHaveBeenCalledWith("v-2");
    expect(prisma.evento_transmisiones.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ grabacionBorradaEn: vencido }) }));
  });
});

describe("Guardar 1 año y página del anfitrión", () => {
  const ahora = new Date("2026-10-20T12:00:00-05:00");
  const tGrab = (extra = {}) => privadoBase({
    funcion: funcion3h(), grabar: true, guardarAnio: false, terminadaEn: new Date("2026-10-17T19:05:00-05:00"),
    limpiadaEn: new Date("2026-10-17T19:05:00-05:00"), grabacionBorradaEn: null, cargos: [],
    grabaciones: [{ id: "g1", videoId: "v-1", orden: 1, estado: "lista", mp4Estado: "lista", r2Key: null, duracionSeg: 3600 }], ...extra
  });

  it("\"Guardar 1 año\" anota el cargo de S/ 50 y activa la descarga de un año", async () => {
    prisma.evento_transmisiones.findFirst.mockResolvedValue(tGrab());
    await svc.guardarAnio(TIENDA, TRANSMISION, user, ahora).catch(() => {});
    expect(prisma.transmision_cargos.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tipo: "guardar_anio", monto: 50, autorizadoPor: "dueno@test.com" })
    }));
    expect(prisma.evento_transmisiones.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ guardarAnio: true }) }));
  });

  it("no se guarda una grabación vencida", async () => {
    prisma.evento_transmisiones.findFirst.mockResolvedValue(tGrab());
    await expect(svc.guardarAnio(TIENDA, TRANSMISION, user, new Date("2026-11-20T00:00:00-05:00"))).rejects.toMatchObject({ details: { motivo: "VENCIDA" } });
  });

  it("el anfitrión ve y descarga del MP4 de Cloudflare; con R2, la descarga sale de R2", async () => {
    const { firmarTokenAnfitrion } = await import("../transmisiones.token.js");
    const token = await firmarTokenAnfitrion({ transmisionId: TRANSMISION, tiendaId: TIENDA });
    prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas Mateo", logoUrl: null });

    prisma.evento_transmisiones.findFirst.mockResolvedValueOnce(tGrab());
    const r = await svc.paginaAnfitrion(token, null, ahora);
    expect(r.estado).toBe("lista");
    expect(r.partes[0]).toMatchObject({ verUrl: "https://cf.test/v-1/iframe", descargaUrl: expect.stringContaining("filename=cumpleanos-de-mateo.mp4") });

    prisma.evento_transmisiones.findFirst.mockResolvedValueOnce(tGrab({ guardarAnio: true, grabaciones: [{ id: "g1", videoId: "v-1", orden: 1, estado: "borrada", mp4Estado: "lista", r2Key: "k1" }] }));
    const despues = await svc.paginaAnfitrion(token, null, new Date("2027-03-01T00:00:00-05:00"));
    expect(despues.partes[0]).toMatchObject({ verUrl: null, descargaUrl: "https://r2.test/k1?firmado" });
  });

  it("un enlace de otra tienda no sirve", async () => {
    const { firmarTokenAnfitrion } = await import("../transmisiones.token.js");
    const token = await firmarTokenAnfitrion({ transmisionId: TRANSMISION, tiendaId: TIENDA });
    await expect(svc.paginaAnfitrion(token, OTRA, ahora)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ============================================
// Fase 5: Premium (retransmisión y resumen con IA)
// ============================================

describe("Premium (R8.2, R8.3)", () => {
  const datosPremium = { ...datosPrivado, plan: "premium" };
  const tPremium = (extra = {}) => privadoBase({ plan: "premium", funcion: funcion3h(), destinos: [], cargos: [], grabaciones: [], ...extra });

  it("al activar anota el cargo de S/ 40 y deja incluida la descarga de un año", async () => {
    proveedor.crearEntrada.mockResolvedValue({ entradaId: "in-nueva", conexion });
    prisma.evento_funciones.findFirst.mockResolvedValue(funcion3h());
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, plan: { horasTransmisionMes: 6 } });
    await svc.activar(TIENDA, FUNCION, datosPremium, user, ahora).catch(() => {});
    expect(prisma.evento_transmisiones.create.mock.calls[0][0].data).toMatchObject({ plan: "premium", guardarAnio: true });
    expect(prisma.transmision_cargos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "premium", monto: 40, autorizadoPor: "dueno@test.com" })
    });
  });

  it("un destino nuevo crea su salida pausada antes de la sala y guarda la clave cifrada", async () => {
    prisma.evento_transmisiones.findFirst.mockResolvedValue(tPremium());
    prisma.transmision_destinos.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
    await svc.agregarDestino(TIENDA, TRANSMISION, { plataforma: "youtube", url: "rtmp://a.rtmp.youtube.com/live2", clave: "yt-clave" }, user, ahora).catch(() => {});
    const data = prisma.transmision_destinos.create.mock.calls[0][0].data;
    expect(data.claveCifrada).not.toContain("yt-clave");
    expect(proveedor.crearSalida).toHaveBeenCalledWith("in-1", { url: "rtmp://a.rtmp.youtube.com/live2", streamKey: "yt-clave", habilitada: false });
  });

  it("hasta 2 destinos, y solo en Premium", async () => {
    prisma.evento_transmisiones.findFirst.mockResolvedValue(tPremium({ destinos: [{ id: "a" }, { id: "b" }] }));
    await expect(svc.agregarDestino(TIENDA, TRANSMISION, { plataforma: "facebook", url: "rtmps://x", clave: "abcd" }, user, ahora))
      .rejects.toMatchObject({ details: { motivo: "TOPE_DESTINOS" } });
    prisma.evento_transmisiones.findFirst.mockResolvedValue(tPremium({ plan: "privado" }));
    await expect(svc.agregarDestino(TIENDA, TRANSMISION, { plataforma: "facebook", url: "rtmps://x", clave: "abcd" }, user, ahora))
      .rejects.toMatchObject({ details: { motivo: "SOLO_PREMIUM" } });
  });

  it("el job habilita la retransmisión al abrir la sala", async () => {
    prisma.transmision_destinos.findMany.mockResolvedValue([{ id: "d1", salidaId: "salida-1", habilitada: false }]);
    await envivo.sincronizarRetransmision(tPremium(), new Date("2026-10-17T15:10:00-05:00"));
    expect(prisma.transmision_destinos.findMany).toHaveBeenCalledWith({ where: { transmisionId: TRANSMISION, salidaId: { not: null }, habilitada: false } });
    expect(proveedor.habilitarSalida).toHaveBeenCalledWith("in-1", "salida-1", true);
  });

  it("con los subtítulos listos, genera el resumen y avisa al anfitrión", async () => {
    const parte = { id: "g1", videoId: "v-1", orden: 1, estado: "lista", mp4Estado: "lista", subtitulosEstado: "listo", duracionSeg: 600, r2Key: "k" };
    prisma.transmision_grabaciones.findMany.mockResolvedValue([]);
    prisma.evento_transmisiones.findMany.mockResolvedValueOnce([tPremium({
      funcion: { ...funcion3h(), evento: { producto: { nombre: "Quinceañero de Valeria" } } }, grabar: true, guardarAnio: true,
      terminadaEn: new Date("2026-10-17T19:05:00-05:00"), limpiadaEn: new Date("2026-10-17T19:05:00-05:00"),
      avisoGrabacionEn: ahora, resumenEstado: null, resumenIntentos: 0, anfitrionEmail: "carla@test.com", grabaciones: [parte]
    })]).mockResolvedValue([]);
    prisma.evento_transmisiones.updateMany.mockResolvedValue({ count: 1 });
    prisma.tiendas.findUnique.mockResolvedValue({ nombre: "Fiestas", email: "negocio@test.com", slug: "fiestas" });

    await grab.cicloGrabaciones(new Date("2026-10-18T10:00:00-05:00"));
    await new Promise(r => setTimeout(r, 20)); // el resumen corre en segundo plano

    expect(proveedor.leerSubtitulos).toHaveBeenCalledWith("v-1", "es");
    expect(ia.generarResumen).toHaveBeenCalledWith({ evento: "Quinceañero de Valeria", partes: [{ vtt: "WEBVTT", desfaseSeg: 0 }] });
    expect(prisma.evento_transmisiones.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resumenEstado: "listo", resumenTokensEntrada: 10 })
    }));
    expect(correo.sendTransmisionGrabacionEmail).toHaveBeenCalledWith(expect.objectContaining({ tipo: "resumen", resumen: { resumen: "Fue lindo", capitulos: [], momentos: [] } }));
  });
});
