import { jest } from "@jest/globals";

// Paso 3 de una campaña (docs/specs/campanas-descuento C3b): guardar con transacción
// simulada y revisión del diálogo de confirmación. El repositorio va simulado.
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
const tx = { soy: "tx" };
const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));

let campanasGuardadas;
jest.unstable_mockModule("../../../services/tienda-diseno.service.js", () => ({
  DISENO_CATEGORIA: "diseno",
  getDiseno: async () => ({ campanas: campanasGuardadas })
}));
jest.unstable_mockModule("../ediciones.service.js", () => ({ edicionesParaResolver: async () => [] }));
const validarCampanasDeTienda = jest.fn(async () => {});
jest.unstable_mockModule("../campanas.validacion.js", () => ({ validarCampanasDeTienda }));
const invalidarContexto = jest.fn();
jest.unstable_mockModule("../../precios/contexto.cache.js", () => ({ invalidarContexto }));
jest.unstable_mockModule("../../precios/contexto.service.js", () => ({ leerPromociones: async () => null }));
jest.unstable_mockModule("../../catalogo/productos.cache.js", () => ({ clear: jest.fn() }));
jest.unstable_mockModule("../../tenants/tiendas.cache.js", () => ({ invalidateTiendasCaches: jest.fn() }));
const historial = { historialDe: jest.fn(async () => []), primerRegistro: jest.fn(async () => new Map()) };
jest.unstable_mockModule("../../catalogo/precio-historial.repository.js", () => ({ precioHistorialRepository: historial }));

const repo = {
  bloquearCampanas: jest.fn(),
  tipoNegocioDe: jest.fn(),
  leerPromocion: jest.fn(),
  confirmacionesDe: jest.fn(),
  arbolCategorias: jest.fn(async () => []),
  idsSonDeLaTienda: jest.fn(async () => true),
  codigoCuponOcupado: jest.fn(async () => false),
  guardarCampanas: jest.fn(),
  guardarPromocion: jest.fn(async () => "p1"),
  borrarPromociones: jest.fn(),
  insertarConfirmacion: jest.fn(),
  productosDelAlcance: jest.fn(async () => []),
  idsDeProductos: jest.fn(),
  productoParaGuarda: jest.fn()
};
jest.unstable_mockModule("../promocion.repository.js", () => repo);

const { guardarCampana, revision, MENSAJES } = await import("../promocion.service.js");

const TIENDA = "11111111-1111-4111-8111-111111111111";
const CAMPANA = "22222222-2222-4222-8222-222222222222";
const lima = (texto) => new Date(`${texto}:00-05:00`);
const AHORA = lima("2026-11-10T12:00");
const USER = { email: "duena@x.com" };

const aniversario = (extra = {}) => ({ id: CAMPANA, presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30", ...extra });
const promocion = (extra = {}) => ({
  porcentaje: 20, alcance: "tienda", categoriaIds: [], productoIds: [], permitirCupones: false, permitirEnvioGratis: false, cupon: null, ...extra
});
const guardada = (extra = {}) => ({ id: "p1", campanaId: CAMPANA, version: 1, ...promocion(), ...extra });
const confirmada = { promocionId: "p1", promocionVersion: 1, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-01T00:00") };

const guardar = (cuerpo) => guardarCampana(TIENDA, CAMPANA, cuerpo, USER, AHORA);
const rechazo = async (promesa) => {
  try {
    await promesa;
  } catch (e) {
    return { status: e.statusCode, motivo: e.details?.motivo, message: e.message };
  }
  throw new Error("se esperaba un rechazo");
};

beforeEach(() => {
  jest.clearAllMocks();
  campanasGuardadas = [aniversario()];
  repo.bloquearCampanas.mockResolvedValue([aniversario()]);
  repo.tipoNegocioDe.mockResolvedValue("productos");
  repo.leerPromocion.mockResolvedValue(null);
  repo.confirmacionesDe.mockResolvedValue([]);
});

describe("guardarCampana: capacidad carrito (R11.1)", () => {
  it("CA-11.1: en una tienda de hotel la promoción se rechaza con 400 y nada se guarda", async () => {
    repo.tipoNegocioDe.mockResolvedValue("hotel");
    expect(await rechazo(guardar({ campana: aniversario(), promocion: promocion() }))).toMatchObject({ status: 400, message: MENSAJES.sinCarrito });
    expect(repo.guardarCampanas).not.toHaveBeenCalled();
  });

  it("en hotel, la campaña sin promoción se guarda como siempre (pasos 1 y 2, R11.3)", async () => {
    repo.tipoNegocioDe.mockResolvedValue("hotel");
    await guardar({ campana: aniversario({ nombre: "Aniversario 10" }), promocion: null });
    expect(repo.guardarCampanas).toHaveBeenCalledWith(tx, TIENDA, [aniversario({ nombre: "Aniversario 10" })], "duena@x.com");
  });

  it("CA-11.2: en una tienda de productos la acepta, versión 1, sin confirmar (solo visual, R5.7)", async () => {
    await guardar({ campana: aniversario(), promocion: promocion() });
    expect(validarCampanasDeTienda).toHaveBeenCalledWith(TIENDA, [aniversario()]);
    expect(repo.guardarPromocion).toHaveBeenCalledWith(tx, TIENDA, CAMPANA, promocion(), expect.objectContaining({ version: 1 }));
    expect(repo.insertarConfirmacion).not.toHaveBeenCalled();
    expect(invalidarContexto).toHaveBeenCalledWith(TIENDA);
  });

  it("una campaña nueva se agrega al arreglo sin tocar las otras", async () => {
    const otra = { id: "33333333-3333-4333-8333-333333333333", presetId: "black-friday", activa: false };
    repo.bloquearCampanas.mockResolvedValue([otra]);
    await guardar({ campana: aniversario(), promocion: null });
    expect(repo.guardarCampanas.mock.calls[0][2]).toEqual([otra, aniversario()]);
  });
});

describe("guardarCampana: confirmación (R9, CA-9.4, E2)", () => {
  beforeEach(() => {
    repo.leerPromocion.mockResolvedValue(guardada());
    repo.confirmacionesDe.mockResolvedValue([confirmada]);
  });

  it("CA-9.4: cambiar el porcentaje de 20 a 25 sin confirmar → 409 y nada se guarda", async () => {
    const r = await rechazo(guardar({ campana: aniversario(), promocion: promocion({ porcentaje: 25 }) }));
    expect(r).toMatchObject({ status: 409, motivo: "CONFIRMACION_REQUERIDA" });
    expect(repo.guardarCampanas).not.toHaveBeenCalled();
    expect(repo.guardarPromocion).not.toHaveBeenCalled();
  });

  it("CA-9.4: extender el fin un día sin confirmar → 409", async () => {
    const r = await rechazo(guardar({ campana: aniversario({ fin: "2026-12-01" }), promocion: promocion() }));
    expect(r).toMatchObject({ status: 409, motivo: "CONFIRMACION_REQUERIDA" });
  });

  it("cambiar un texto del aspecto no pide confirmación ni sube la versión", async () => {
    await guardar({ campana: aniversario({ topBar: "Todo al 20 %" }), promocion: promocion() });
    expect(repo.guardarPromocion).toHaveBeenCalledWith(tx, TIENDA, CAMPANA, promocion(), expect.objectContaining({ version: 1 }));
  });

  it("apagar la campaña o quitar la promoción no pide confirmación", async () => {
    await guardar({ campana: aniversario({ activa: false }), promocion: promocion({ porcentaje: 25 }) });
    expect(repo.guardarPromocion).toHaveBeenCalledWith(tx, TIENDA, CAMPANA, promocion({ porcentaje: 25 }), expect.objectContaining({ version: 2 }));
    jest.clearAllMocks();
    await guardar({ campana: aniversario(), promocion: null });
    expect(repo.borrarPromociones).toHaveBeenCalledWith(tx, TIENDA, [CAMPANA]);
  });

  it("con confirmación de lo que vio: sube la versión y registra quién, qué y qué ventana (R9.4)", async () => {
    await guardar({
      campana: aniversario({ fin: "2026-12-01" }),
      promocion: promocion({ porcentaje: 25 }),
      confirmar: { version: 1, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-02T00:00") }
    });
    expect(repo.guardarPromocion).toHaveBeenCalledWith(tx, TIENDA, CAMPANA, expect.anything(), expect.objectContaining({ version: 2 }));
    expect(repo.insertarConfirmacion).toHaveBeenCalledWith(tx, expect.objectContaining({
      tiendaId: TIENDA, promocionId: "p1", campanaId: CAMPANA, promocionVersion: 2,
      ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-02T00:00"),
      confirmadoPor: "duena@x.com", detalle: expect.objectContaining({ porcentaje: 25, alcance: "tienda" })
    }));
  });

  it("PROMOCION_CAMBIO: si la versión que vio no es la guardada → 409 y nada se guarda", async () => {
    const r = await rechazo(guardar({
      campana: aniversario(), promocion: promocion({ porcentaje: 25 }),
      confirmar: { version: 0, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-01T00:00") }
    }));
    expect(r).toMatchObject({ status: 409, motivo: "PROMOCION_CAMBIO" });
    expect(repo.guardarCampanas).not.toHaveBeenCalled();
  });

  it("PROMOCION_CAMBIO: si la ventana que vio no es la de la campaña → 409", async () => {
    const r = await rechazo(guardar({
      campana: aniversario(), promocion: promocion(),
      confirmar: { version: 1, ventanaInicio: lima("2026-11-21T00:00"), ventanaFin: lima("2026-12-01T00:00") }
    }));
    expect(r).toMatchObject({ status: 409, motivo: "PROMOCION_CAMBIO" });
  });
});

describe("guardarCampana: datos de la tienda", () => {
  it("ids de categorías o productos de otra tienda → 400", async () => {
    repo.idsSonDeLaTienda.mockResolvedValueOnce(false);
    const r = await rechazo(guardar({ campana: aniversario(), promocion: promocion({ alcance: "categorias", categoriaIds: ["c-ajena"] }) }));
    expect(r).toMatchObject({ status: 400, message: MENSAJES.idsAjenos });
    expect(repo.guardarCampanas).not.toHaveBeenCalled();
  });

  it("cupón con un código que ya usa otro cupón de la tienda → 400", async () => {
    repo.codigoCuponOcupado.mockResolvedValueOnce(true);
    const cupon = { codigo: "CYBER10", tipo: "porcentaje", valor: 10, minimoCompra: 0, usoMaximo: null, usoMaximoPorCliente: 1 };
    expect(await rechazo(guardar({ campana: aniversario(), promocion: promocion({ cupon }) }))).toMatchObject({ status: 400 });
  });

  it("la campaña del cuerpo debe ser la de la dirección", async () => {
    expect(await rechazo(guardar({ campana: aniversario({ id: "otra" }), promocion: null }))).toMatchObject({ status: 400 });
  });
});

describe("revision (R4.6, R9.2, R10)", () => {
  const productos = [
    { id: "a", nombre: "Zapatilla Run", categoriaId: "zap", precioBase: 100, precioOferta: null, precioCosto: 85 },
    { id: "b", nombre: "Zapatilla Trail", categoriaId: "zap", precioBase: 120, precioOferta: 70, precioCosto: null },
    { id: "c", nombre: "Zapatilla Kids", categoriaId: "zap", precioBase: 60, precioOferta: null, precioCosto: 20 }
  ];
  beforeEach(() => repo.productosDelAlcance.mockResolvedValue(productos));

  it("CA-4.6: cuántos productos entran hoy y el ejemplo S/ 100 → S/ 80", async () => {
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion() }, {}, AHORA);
    expect(r).toEqual({ productos: 3, ejemplo: { regular: 100, vigente: 80, producto: { id: "a", nombre: "Zapatilla Run" } } });
    expect(historial.historialDe).not.toHaveBeenCalled();
  });

  it("sin productos el ejemplo es de S/ 100", async () => {
    repo.productosDelAlcance.mockResolvedValue([]);
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion({ porcentaje: 30 }) }, {}, AHORA);
    expect(r.ejemplo).toEqual({ regular: 100, vigente: 70, producto: null });
  });

  it("CA-11.1: en una tienda sin carrito no hay revisión", async () => {
    repo.tipoNegocioDe.mockResolvedValue("tours");
    expect(await rechazo(revision(TIENDA, CAMPANA, { promocion: promocion() }, {}, AHORA))).toMatchObject({ status: 400 });
  });

  it("completa: ventana con día de la semana, costo, oferta propia, subidas y sin historial", async () => {
    historial.historialDe.mockResolvedValue([
      { productoId: "a", motivo: "cambio", precioAnterior: 80, precioNuevo: 100, fecha: lima("2026-11-10T09:00") }
    ]);
    historial.primerRegistro.mockResolvedValue(new Map([["a", lima("2026-09-01T00:00")], ["b", lima("2026-09-01T00:00")], ["c", lima("2026-11-10T00:00")]]));
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion() }, { completa: true }, AHORA);

    expect(r.ventana).toMatchObject({ desde: "vie 20 nov, 00:00", hasta: "lun 30 nov, 23:59", inicio: "2026-11-20T00:00:00-05:00" });
    expect(r.muyAlto).toBe(false);
    // CA-4.8: S/ 100 con costo 85 queda en S/ 80; S/ 60 con costo 20 queda en S/ 48 (no).
    expect(r.bajoCosto).toEqual({ total: 1, muestra: [{ id: "a", nombre: "Zapatilla Run", precio: 80, costo: 85 }] });
    // CA-10.7
    expect(r.conOferta).toEqual({ total: 1, muestra: [{ id: "b", nombre: "Zapatilla Trail" }] });
    // CA-10.2: subió de 80 a 100 el 10 nov y la promoción empieza el 20 nov.
    expect(r.subidas).toMatchObject({ total: 1, ids: ["a"], muestra: [{ id: "a", antes: 80, ahora: 100 }] });
    expect(historial.historialDe).toHaveBeenCalledWith(TIENDA, ["a", "b", "c"], lima("2026-10-21T00:00"));
    // CA-10.5: el primer registro de "c" es de hace menos de 30 días antes del inicio.
    expect(r.sinHistorial).toEqual({ total: 1, muestra: [{ id: "c", nombre: "Zapatilla Kids" }] });
  });

  it("CA-10.3: la última subida antes de los 30 días no avisa", async () => {
    historial.historialDe.mockResolvedValue([
      { productoId: "a", motivo: "cambio", precioAnterior: 80, precioNuevo: 100, fecha: lima("2026-10-15T09:00") }
    ]);
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion() }, { completa: true }, AHORA);
    expect(r.subidas.total).toBe(0);
  });

  it("desde 50 % la confirmación lo marca como descuento muy alto (R4.2)", async () => {
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion({ porcentaje: 50 }) }, { completa: true }, AHORA);
    expect(r.muyAlto).toBe(true);
  });

  it("usa las fechas del borrador si vienen (sin guardar)", async () => {
    const r = await revision(TIENDA, CAMPANA, { promocion: promocion(), campana: aniversario({ inicio: "2026-11-27" }) }, { completa: true }, AHORA);
    expect(r.ventana.desde).toBe("vie 27 nov, 00:00");
  });
});
