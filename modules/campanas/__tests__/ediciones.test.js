import { jest } from "@jest/globals";

// Ediciones "por año" (docs/specs/campanas-cuando R2): resolución pura y servicio con la BD simulada.
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
const tx = {
  campana_ediciones: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  campana_ediciones_historial: { create: jest.fn() }
};
const prisma = {
  campana_ediciones: { findMany: jest.fn() },
  campana_ediciones_historial: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (fn) => fn(tx))
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));
const limpiarTiendas = jest.fn();
jest.unstable_mockModule("../../tenants/tiendas.cache.js", () => ({ invalidateTiendasStoreCache: limpiarTiendas }));

const { vigente, proximoCambio } = await import("../calendario.js");
const { efectiva, calendarioAnual, disenoPublico } = await import("../resolver.js");
const { CAMPANA_PRESETS, buscarPreset } = await import("../presets.js");
const { fechaClave } = await import("../calendario.js");
const svc = await import("../ediciones.service.js");
const { edicionesFaltantes } = await import("../ediciones.faltantes.js");
const { edicionBodySchema } = await import("../ediciones.schema.js");
const { default: rutas } = await import("../ediciones.admin.routes.js");
const { requirePlatformAdmin } = await import("../../../middlewares/platform-admin.middleware.js");

const lima = (texto) => new Date(`${texto}:00-05:00`);
const ed = (clave, inicio, fin, extra = {}) => ({
  presetId: "cyber-wow", anio: +inicio.slice(0, 4), clave, nombre: clave, inicio, horaInicio: null, fin, horaFin: null, fuente: null, ...extra
});
const wow = (extra = {}) => efectiva({ id: "w", activa: true, presetId: "cyber-wow", ...extra });
const idVigente = (campanas, texto, ediciones) => vigente(campanas, lima(texto), ediciones)?.campana.id ?? null;
const ymd = ({ anio, mes, dia }) => `${anio}-${mes}-${dia}`;

describe("Cyber Monday (CA-2.1)", () => {
  const regla = buscarPreset("cyber-monday").regla;
  it("es el lunes siguiente al Black Friday", () => {
    expect(ymd(fechaClave(regla, 2026))).toBe("2026-11-30");
    expect(ymd(fechaClave(regla, 2027))).toBe("2027-11-29");
  });
});

describe("Cyber Wow, ventanas por año (R2.1, R2.5)", () => {
  const noviembre = [ed("noviembre", "2026-11-02", "2026-11-05")];

  it("CA-2.2: con anticipación 1, se ve desde el 1 nov 00:00 hasta el 5 nov 23:59 y el 6 ya no", () => {
    const c = wow({ anticipacionDias: 1 });
    expect(idVigente([c], "2026-10-31T23:59", noviembre)).toBeNull();
    expect(idVigente([c], "2026-11-01T00:00", noviembre)).toBe("w");
    expect(idVigente([c], "2026-11-05T23:59", noviembre)).toBe("w");
    expect(idVigente([c], "2026-11-06T00:00", noviembre)).toBeNull();
  });

  it("CA-2.3: se resuelve por edición; la que no está cargada no se ve", () => {
    const c = wow({ anticipacionDias: 0 });
    const cargadas = [ed("abril", "2027-04-06", "2027-04-09"), ed("julio", "2027-07-13", "2027-07-16")];
    expect(idVigente([c], "2027-04-07T12:00", cargadas)).toBe("w");
    expect(idVigente([c], "2027-07-14T12:00", cargadas)).toBe("w");
    expect(idVigente([c], "2027-11-03T12:00", cargadas)).toBeNull();
  });

  it("CA-2.4: un año sin ediciones no usa las del anterior", () => {
    const c = wow();
    const de2026 = [ed("noviembre", "2026-11-02", "2026-11-05")];
    expect(idVigente([c], "2027-11-03T12:00", de2026)).toBeNull();
    expect(idVigente([c], "2027-11-03T12:00", [])).toBeNull();
    expect(idVigente([c], "2027-11-03T12:00", null)).toBeNull();
  });

  it("la hora de la plataforma vale; la de la tienda la reemplaza (R7.2)", () => {
    const e = [ed("noviembre", "2026-11-02", "2026-11-05", { horaInicio: "10:00", horaFin: "22:00" })];
    const sinPropia = wow({ anticipacionDias: 0 });
    expect(idVigente([sinPropia], "2026-11-02T09:59", e)).toBeNull();
    expect(idVigente([sinPropia], "2026-11-02T10:00", e)).toBe("w");
    expect(idVigente([sinPropia], "2026-11-05T21:59", e)).toBe("w");
    expect(idVigente([sinPropia], "2026-11-05T22:00", e)).toBeNull();

    const propia = wow({ anticipacionDias: 0, horaInicio: "08:00", horaFin: "12:00" });
    expect(idVigente([propia], "2026-11-02T08:00", e)).toBe("w");
    expect(idVigente([propia], "2026-11-05T12:00", e)).toBeNull();
  });

  it("CA-2.9: en julio gana Cyber Wow (prioridad 2) sobre Fiestas Patrias", () => {
    const fp = efectiva({ id: "fp", activa: true, presetId: "fiestas-patrias" });
    const e = [ed("julio", "2026-07-13", "2026-07-16")];
    expect(idVigente([fp, wow({ anticipacionDias: 0 })], "2026-07-14T12:00", e)).toBe("w");
    expect(idVigente([fp, wow({ anticipacionDias: 0 })], "2026-07-20T12:00", e)).toBe("fp");
  });

  it("CA-2.10: el 30 nov gana Cyber Monday sobre Black Friday; el 29, Black Friday", () => {
    const bf = efectiva({ id: "bf", activa: true, presetId: "black-friday" });
    const cm = efectiva({ id: "cm", activa: true, presetId: "cyber-monday" });
    expect(idVigente([bf, cm], "2026-11-30T12:00")).toBe("cm");
    expect(idVigente([bf, cm], "2026-11-29T12:00")).toBe("bf");
  });

  it("una edición que cae en dos ventanas del efecto cubre todos sus días (R2.5)", () => {
    const c = wow({ anticipacionDias: 0, efecto: "etiquetas", efectoModo: "clave" });
    const d = disenoPublico({ campanas: [{ id: "w", presetId: "cyber-wow", activa: true }] }, lima("2026-11-04T12:00"), "productos", noviembre);
    expect(d.campana.efecto).toEqual({ tipo: "etiquetas", saludo: expect.any(String) });
    expect(c.efecto).toBe("etiquetas");
  });
});

describe("proximoCambio con ediciones (R3.9.1)", () => {
  it("incluye el inicio y el fin de cada edición", () => {
    const c = wow({ anticipacionDias: 0 });
    const e = [ed("abril", "2026-04-06", "2026-04-09"), ed("julio", "2026-07-13", "2026-07-16")];
    expect(proximoCambio([c], lima("2026-04-01T12:00"), e)).toEqual(lima("2026-04-06T00:00"));
    expect(proximoCambio([c], lima("2026-04-07T12:00"), e)).toEqual(lima("2026-04-10T00:00"));
    expect(proximoCambio([c], lima("2026-04-20T12:00"), e)).toEqual(lima("2026-07-13T00:00"));
    expect(proximoCambio([c], lima("2026-08-01T12:00"), e)).toBeNull();
  });
});

describe("proximoCambio con Black Friday y Cyber Monday (CA-3.13)", () => {
  const bf = efectiva({ id: "bf", activa: true, presetId: "black-friday" });
  const cm = efectiva({ id: "cm", activa: true, presetId: "cyber-monday" });
  it("el 29 nov el próximo cambio es el inicio del Cyber Monday; el 30 nov, el fin de ambos", () => {
    expect(proximoCambio([bf, cm], lima("2026-11-29T12:00"))).toEqual(lima("2026-11-30T00:00"));
    expect(proximoCambio([bf, cm], lima("2026-11-30T12:00"))).toEqual(lima("2026-12-01T00:00"));
  });
});

describe("calendario del Admin: por anunciar (R2.6.2, R2.6.3)", () => {
  const fila = (anio, ediciones) =>
    calendarioAnual([{ id: "w", presetId: "cyber-wow", activa: true }], "general", anio, ediciones).find((f) => f.presetId === "cyber-wow");

  it("año sin ediciones: la fila sigue, sin fechas, con las tres por anunciar y activable", () => {
    const f = fila(2027, [ed("noviembre", "2026-11-02", "2026-11-05")]);
    expect(f.activa).toBe(true);
    expect(f.inicio).toBeNull();
    expect(f.ventanas).toEqual([]);
    expect(f.porAnunciar.map((e) => e.clave)).toEqual(["abril", "julio", "noviembre"]);
  });

  it("ediciones parciales: una ventana por edición cargada y noviembre por anunciar", () => {
    const f = fila(2027, [ed("abril", "2027-04-06", "2027-04-09"), ed("julio", "2027-07-13", "2027-07-16")]);
    expect(f.ventanas.map((v) => v.edicion)).toEqual(["abril", "julio"]);
    expect(f.ediciones.map((e) => e.clave)).toEqual(["abril", "julio"]);
    expect(f.porAnunciar.map((e) => e.clave)).toEqual(["noviembre"]);
    expect(f.inicio).toBe(f.ventanas[0].inicio);
  });

  it("sin ediciones nulas ni lista (backend sin la tabla) el calendario no se cae y se ordena", () => {
    const filas = calendarioAnual([], "general", 2027, null);
    expect(filas.find((f) => f.presetId === "cyber-wow").porAnunciar).toHaveLength(3);
    const orden = filas.map((f) => f.inicio ?? "");
    expect(orden).toHaveLength(CAMPANA_PRESETS.length);
  });
});

describe("validación de una edición (R2.4, CA-2.7)", () => {
  it("acepta una edición normal", () => {
    expect(svc.errorDeEdicion(ed("noviembre", "2026-11-02", "2026-11-05"), 2026, [])).toBeNull();
  });
  it("rechaza el fin anterior al inicio, también por horas", () => {
    expect(svc.errorDeEdicion(ed("a", "2026-11-05", "2026-11-02"), 2026)?.message).toMatch(/posteriores al inicio/);
    const mismoDia = ed("a", "2026-11-02", "2026-11-02", { horaInicio: "10:00", horaFin: "09:00" });
    expect(svc.errorDeEdicion(mismoDia, 2026)?.message).toMatch(/posteriores al inicio/);
  });
  it("rechaza más de 30 días", () => {
    const largo = ed("a", "2026-11-01", "2026-12-08");
    expect(svc.errorDeEdicion(largo, 2026)?.message).toBe("Una edición dura como máximo 30 días (esta dura 38).");
    expect(svc.errorDeEdicion(ed("a", "2026-11-01", "2026-11-30"), 2026)).toBeNull();
  });
  it("rechaza el cruce con otra edición del año", () => {
    const otra = ed("julio", "2026-07-13", "2026-07-16");
    const e = svc.errorDeEdicion(ed("noviembre", "2026-07-15", "2026-07-20"), 2026, [otra]);
    expect(e?.message).toMatch(/Se cruza con la edición julio/);
    expect(svc.errorDeEdicion(ed("noviembre", "2026-07-17", "2026-07-20"), 2026, [otra])).toBeNull();
  });
  it("rechaza una edición que no empieza en su año", () => {
    expect(svc.errorDeEdicion(ed("a", "2026-11-02", "2026-11-05"), 2027)?.message).toBe("La edición debe empezar en 2027.");
  });
  it("la fuente solo admite https (R7.8)", () => {
    const base = { inicio: "2026-11-02", fin: "2026-11-05" };
    expect(edicionBodySchema.safeParse({ ...base, fuente: "https://iab.pe/cyber-wow" }).success).toBe(true);
    expect(edicionBodySchema.safeParse({ ...base, fuente: "javascript:alert(1)" }).success).toBe(false);
    expect(edicionBodySchema.safeParse({ ...base, fuente: "http://iab.pe" }).success).toBe(false);
    expect(edicionBodySchema.safeParse({ ...base, fuente: "" }).data.fuente).toBeNull();
  });
});

const fila = (extra = {}) => ({
  id: "e1", presetId: "cyber-wow", anio: 2026, clave: "noviembre", nombre: "Noviembre",
  fechaInicio: new Date("2026-11-02T00:00:00Z"), horaInicio: null,
  fechaFin: new Date("2026-11-05T00:00:00Z"), horaFin: new Date("1970-01-01T12:00:00Z"),
  fuente: null, usuarioRegistro: "a@x.com", usuarioActualizacion: null, fechaRegistro: new Date(), fechaActualizacion: null, ...extra
});
const admin = { id: "u1", email: "plataforma@test.com" };
const body = { inicio: "2026-11-02", horaInicio: null, fin: "2026-11-05", horaFin: null, fuente: null };

describe("guardar / eliminar (R2.7)", () => {
  beforeEach(() => {
    Object.values(tx).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    prisma.campana_ediciones.findMany.mockReset().mockResolvedValue([]);
    prisma.campana_ediciones_historial.findMany.mockReset().mockResolvedValue([]);
    prisma.$queryRaw.mockReset();
    limpiarTiendas.mockClear();
    prisma.$transaction.mockClear();
    svc.invalidarEdiciones();
  });

  it("crea una edición nueva con su historial en la misma transacción y limpia la caché de las tiendas", async () => {
    tx.campana_ediciones.create.mockResolvedValue(fila());
    const r = await svc.guardar({ presetId: "cyber-wow", anio: 2026, clave: "noviembre" }, body, admin);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.campana_ediciones.create).toHaveBeenCalledWith({ data: expect.objectContaining({ presetId: "cyber-wow", anio: 2026, clave: "noviembre", nombre: "Noviembre", usuarioRegistro: "plataforma@test.com" }) });
    expect(tx.campana_ediciones_historial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: "crear", antes: null, despues: expect.objectContaining({ inicio: "2026-11-02" }), usuario: "plataforma@test.com" })
    });
    expect(limpiarTiendas).toHaveBeenCalled();
    expect(r.inicio).toBe("2026-11-02");
    expect(r.horaFin).toBe("12:00");
  });

  it("al cambiar una cargada anota el antes y el después", async () => {
    prisma.campana_ediciones.findMany.mockResolvedValue([fila()]);
    tx.campana_ediciones.update.mockResolvedValue(fila({ fechaFin: new Date("2026-11-04T00:00:00Z") }));
    await svc.guardar({ presetId: "cyber-wow", anio: 2026, clave: "noviembre" }, { ...body, fin: "2026-11-04", horaFin: "12:00" }, admin);
    expect(tx.campana_ediciones.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "e1" } }));
    const { data } = tx.campana_ediciones_historial.create.mock.calls[0][0];
    expect(data.accion).toBe("cambiar");
    expect(data.antes).toMatchObject({ fin: "2026-11-05", horaFin: "12:00" });
    expect(data.despues).toMatchObject({ fin: "2026-11-04", horaFin: "12:00" });
  });

  it("una edición inválida no escribe nada ni limpia la caché", async () => {
    await expect(svc.guardar({ presetId: "cyber-wow", anio: 2026, clave: "noviembre" }, { ...body, fin: "2026-10-01" }, admin))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(limpiarTiendas).not.toHaveBeenCalled();
  });

  it("solo las ediciones esperadas del preset; y solo campañas por año", async () => {
    await expect(svc.guardar({ presetId: "cyber-wow", anio: 2026, clave: "enero" }, body, admin)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.guardar({ presetId: "black-friday", anio: 2026, clave: "noviembre" }, body, admin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("al borrar deja el historial y limpia la caché", async () => {
    prisma.campana_ediciones.findMany.mockResolvedValue([fila()]);
    await svc.eliminar({ presetId: "cyber-wow", anio: 2026, clave: "noviembre" }, admin);
    expect(tx.campana_ediciones_historial.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accion: "borrar", despues: null }) });
    expect(tx.campana_ediciones.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(limpiarTiendas).toHaveBeenCalled();
  });

  it("la resolución lee con caché y, si la tabla falla, sigue sin ediciones", async () => {
    prisma.campana_ediciones.findMany.mockResolvedValue([fila()]);
    expect(await svc.edicionesParaResolver()).toHaveLength(1);
    await svc.edicionesParaResolver();
    expect(prisma.campana_ediciones.findMany).toHaveBeenCalledTimes(1);
    svc.invalidarEdiciones();
    prisma.campana_ediciones.findMany.mockRejectedValue(new Error("la tabla no existe"));
    expect(await svc.edicionesParaResolver()).toEqual([]);
  });

  it("cuenta las tiendas con la campaña activa y devuelve solo el número (R7.7)", async () => {
    prisma.$queryRaw.mockResolvedValue([{ total: 14 }]);
    expect(await svc.tiendasConCampana("cyber-wow")).toEqual({ total: 14 });
  });

  it("la pantalla del año trae lo cargado, lo que falta y el historial por edición", async () => {
    prisma.campana_ediciones.findMany.mockResolvedValue([fila()]);
    prisma.campana_ediciones_historial.findMany.mockResolvedValue([{ id: "h1", clave: "noviembre", accion: "crear", antes: null, despues: {}, usuario: "a@x.com", fecha: new Date() }]);
    const [wowVista] = await svc.vistaAnio(2026);
    const porClave = Object.fromEntries(wowVista.ediciones.map((e) => [e.clave, e]));
    expect(porClave.noviembre.cargada.inicio).toBe("2026-11-02");
    expect(porClave.noviembre.historial).toHaveLength(1);
    expect(porClave.abril.cargada).toBeNull();
  });
});

describe("permiso (CA-2.7)", () => {
  it("todas las rutas de ediciones pasan primero por requirePlatformAdmin", () => {
    expect(rutas.stack[0].handle).toBe(requirePlatformAdmin);
  });
  it("quien no es de la plataforma recibe 403", () => {
    const next = jest.fn();
    requirePlatformAdmin({ user: { email: "dueno@tienda.com" } }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });
});

describe("aviso de fechas faltantes (R2.6.4)", () => {
  it("lista las esperadas sin cargar del año en curso y el siguiente que no pasaron", () => {
    const f = edicionesFaltantes([ed("abril", "2026-04-06", "2026-04-09")], lima("2026-05-01T12:00"));
    expect(f.map((x) => `${x.anio}-${x.clave}`)).toEqual([
      "2026-julio", "2026-noviembre", "2027-abril", "2027-julio", "2027-noviembre"
    ]);
  });
  it("el correo sale desde 60 días antes del día 1 del mes esperado", () => {
    const julio = (ahora) => edicionesFaltantes([], lima(ahora)).find((x) => x.anio === 2026 && x.clave === "julio");
    expect(julio("2026-05-01T00:00").avisarPorCorreo).toBe(false); // faltan 61 días
    expect(julio("2026-05-02T00:00").avisarPorCorreo).toBe(true);  // faltan 60
  });
  it("una cargada no se avisa", () => {
    const f = edicionesFaltantes([ed("julio", "2026-07-13", "2026-07-16")], lima("2026-05-02T00:00"));
    expect(f.some((x) => x.anio === 2026 && x.clave === "julio")).toBe(false);
  });
});

// campanas-cuando R2.9: "Mis fechas" sobre un preset (tiendas A, B, C, D con su propio Cyber Wow).
describe("Mis fechas sobre un preset (R2.9)", () => {
  const noviembre = [ed("noviembre", "2026-11-02", "2026-11-05")];
  const propioWow = (inicio, fin, extra = {}) => ({ id: "w", presetId: "cyber-wow", activa: true, inicio, fin, ...extra });

  it("la tienda usa sus fechas y no las ediciones; conserva el aspecto del preset", () => {
    const enSusFechas = disenoPublico({ campanas: [propioWow("2026-10-01", "2026-10-05")] }, lima("2026-10-03T12:00"), "productos", noviembre);
    expect(enSusFechas.campana).toMatchObject({ presetId: "cyber-wow", inicio: "2026-10-01T00:00:00-05:00", fin: "2026-10-06T00:00:00-05:00" });
    expect(enSusFechas.campana.paleta).toEqual(buscarPreset("cyber-wow").paleta);
    const enLaOficial = disenoPublico({ campanas: [propioWow("2026-10-01", "2026-10-05")] }, lima("2026-11-03T12:00"), "productos", noviembre);
    expect(enLaOficial.campana).toBeNull();
  });

  it("respeta la hora y sirve también para un año siguiente (tienda D: 1 al 5 ene 2027)", () => {
    const c = propioWow("2027-01-01", "2027-01-05", { horaInicio: "10:00" });
    expect(disenoPublico({ campanas: [c] }, lima("2027-01-01T09:59"), "productos", noviembre).campana).toBeNull();
    expect(disenoPublico({ campanas: [c] }, lima("2027-01-01T10:00"), "productos", noviembre).campana).not.toBeNull();
  });

  it("el calendario del dueño marca misFechas y muestra su rango", () => {
    const fila = calendarioAnual([propioWow("2026-10-07", "2026-10-19")], "general", 2026, noviembre).find((f) => f.presetId === "cyber-wow");
    expect(fila).toMatchObject({ misFechas: true, inicio: "2026-10-07T00:00:00-05:00", fin: "2026-10-20T00:00:00-05:00" });
    expect(fila.ventanas).toHaveLength(1);
    const oficial = calendarioAnual([{ id: "w", presetId: "cyber-wow", activa: true }], "general", 2026, noviembre).find((f) => f.presetId === "cyber-wow");
    expect(oficial.misFechas).toBe(false);
  });

  it("el próximo cambio sale de las fechas de la tienda", () => {
    const ef = efectiva(propioWow("2026-10-01", "2026-10-05"));
    expect(proximoCambio([ef], lima("2026-09-30T12:00"), noviembre)).toEqual(lima("2026-10-01T00:00"));
  });
});
