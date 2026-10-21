import { jest } from "@jest/globals";

// Guardas de C3b (docs/specs/campanas-descuento): precio regular durante una promoción en
// curso (R10.5, CA-10.6), repositorio (ids, confirmación idempotente) y el PUT de diseño
// (fechas de una campaña confirmada, promoción huérfana). BD simulada.
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
const prisma = {
  productos: { findUnique: jest.fn(), count: jest.fn() },
  producto_variantes: { findUnique: jest.fn() },
  categorias: { count: jest.fn() },
  campana_promocion_confirmaciones: { createMany: jest.fn() },
  campana_promociones: { deleteMany: jest.fn(() => "borrar-huerfanas") },
  tienda_configuraciones: { upsert: jest.fn(() => "upsert"), findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (ops) => ops)
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));
jest.unstable_mockModule("../../../services/storage.service.js", () => ({ publicBaseUrl: () => "https://cdn.x" }));
const promocionesDeProducto = jest.fn();
jest.unstable_mockModule("../promocion.service.js", () => ({ promocionesDeProducto }));
let datosPromociones = null;
jest.unstable_mockModule("../../precios/contexto.service.js", () => ({ leerPromociones: async () => datosPromociones }));

const { guardaPrecioProducto, guardaPrecioVariante, guardaPrecioVariantes, mensajePrecioEnPromocion } = await import("../promocion.guardas.js");
const repo = await import("../promocion.repository.js");
const { saveDiseno } = await import("../../../services/tienda-diseno.service.js");
const { validarPromocionesDelDiseno } = await import("../campanas.validacion.js");

const TIENDA = "11111111-1111-4111-8111-111111111111";
const lima = (texto) => new Date(`${texto}:00-05:00`);
const zapatilla = { id: "z1", tiendaId: TIENDA, categoriaId: "zap", precioBase: 100, variantes: [{ id: "v1", precio: null }, { id: "v2", precio: 110 }] };
const enCurso = { campanaId: "c1", nombre: "Black Friday", porcentaje: 20, inicio: "2026-11-20T00:00:00-05:00", fin: "2026-12-01T00:00:00-05:00", hasta: "lun 30 nov, 23:59", enCurso: true };

async function correr(middleware, req) {
  const next = jest.fn();
  try {
    await middleware(req, {}, next);
  } catch (e) {
    return { error: e, next };
  }
  return { next };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.productos.findUnique.mockResolvedValue(zapatilla);
  promocionesDeProducto.mockResolvedValue([enCurso]);
});

describe("R10.5: precio regular durante una promoción en curso (CA-10.6)", () => {
  it("subir de S/ 100 a S/ 120 → 409 con la campaña y la fecha de fin", async () => {
    const { error, next } = await correr(guardaPrecioProducto, { params: { id: "z1" }, body: { precioBase: 120 } });
    expect(next).not.toHaveBeenCalled();
    expect(error.statusCode).toBe(409);
    expect(error.details).toMatchObject({ motivo: "PRECIO_EN_PROMOCION", campana: { id: "c1", nombre: "Black Friday" } });
    expect(error.message).toBe(mensajePrecioEnPromocion("Black Friday", "lun 30 nov, 23:59"));
    expect(error.message).toBe("Este producto está en la promoción Black Friday hasta el lun 30 nov, 23:59. Para cambiar su precio regular, apaga la promoción o espera a que termine.");
  });

  it("bajarlo a S/ 90 o cambiar la descripción pasa sin consultar promociones", async () => {
    expect((await correr(guardaPrecioProducto, { params: { id: "z1" }, body: { precioBase: 90 } })).next).toHaveBeenCalled();
    expect((await correr(guardaPrecioProducto, { params: { id: "z1" }, body: { descripcion: "Nueva" } })).next).toHaveBeenCalled();
    expect(promocionesDeProducto).not.toHaveBeenCalled();
  });

  it("una promoción que todavía no empieza no bloquea (solo avisa el formulario, R10.3)", async () => {
    promocionesDeProducto.mockResolvedValue([{ ...enCurso, enCurso: false }]);
    expect((await correr(guardaPrecioProducto, { params: { id: "z1" }, body: { precioBase: 120 } })).next).toHaveBeenCalled();
  });

  it("matriz de variantes: sube una existente (sin precio propio usa el del producto) → 409; una nueva no cuenta", async () => {
    const sube = await correr(guardaPrecioVariantes, { params: { id: "z1" }, body: { variantes: [{ id: "v1", precio: 105 }] } });
    expect(sube.error?.statusCode).toBe(409);
    const baja = await correr(guardaPrecioVariantes, { params: { id: "z1" }, body: { variantes: [{ id: "v2", precio: 100 }, { precio: 300 }] } });
    expect(baja.next).toHaveBeenCalled();
  });

  it("variante suelta: subir su precio → 409; bajarlo pasa", async () => {
    prisma.producto_variantes.findUnique.mockResolvedValue({ id: "v2", precio: 110, producto: zapatilla });
    expect((await correr(guardaPrecioVariante, { params: { id: "v2" }, body: { precio: 115 } })).error?.statusCode).toBe(409);
    expect((await correr(guardaPrecioVariante, { params: { id: "v2" }, body: { precio: 99 } })).next).toHaveBeenCalled();
  });
});

describe("promocion.repository", () => {
  it("la confirmación es idempotente: ON CONFLICT DO NOTHING (un doble clic deja una fila)", async () => {
    await repo.insertarConfirmacion(prisma, { tiendaId: TIENDA, promocionId: "p1" });
    expect(prisma.campana_promocion_confirmaciones.createMany).toHaveBeenCalledWith({ data: [{ tiendaId: TIENDA, promocionId: "p1" }], skipDuplicates: true });
  });

  it("ids de otra tienda: la cantidad encontrada no coincide con la pedida", async () => {
    prisma.categorias.count.mockResolvedValue(1);
    prisma.productos.count.mockResolvedValue(2);
    expect(await repo.idsSonDeLaTienda(prisma, TIENDA, { categoriaIds: ["a", "b"] })).toBe(false);
    expect(await repo.idsSonDeLaTienda(prisma, TIENDA, { productoIds: ["x", "y"] })).toBe(true);
    expect(prisma.categorias.count).toHaveBeenCalledWith({ where: { tiendaId: TIENDA, id: { in: ["a", "b"] } } });
  });
});

describe("PUT de diseño (T3b.7)", () => {
  const aniv = (extra = {}) => ({ id: "c-aniv", presetId: null, activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30", ...extra });

  it("una campaña que ya no está en el arreglo se lleva su promoción en la misma transacción", async () => {
    await saveDiseno(TIENDA, { campanas: [aniv()] }, { email: "d@x.com" });
    expect(prisma.campana_promociones.deleteMany).toHaveBeenCalledWith({ where: { tiendaId: TIENDA, campanaId: { notIn: ["c-aniv"] } } });
    expect(prisma.$transaction.mock.calls[0][0]).toContain("borrar-huerfanas");
  });

  it("un guardado sin campañas no toca las promociones", async () => {
    await saveDiseno(TIENDA, { anuncio: { texto: "Hola" } }, { email: "d@x.com" });
    expect(prisma.campana_promociones.deleteMany).not.toHaveBeenCalled();
  });

  describe("cambiar las fechas de una campaña con promoción confirmada", () => {
    const ahora = lima("2026-11-10T12:00");
    beforeEach(() => {
      datosPromociones = {
        campanas: [aniv()],
        promociones: [{ id: "p1", campanaId: "c-aniv", version: 1, porcentaje: 20, alcance: "tienda" }],
        confirmaciones: [{ promocionId: "p1", promocionVersion: 1, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-01T00:00") }],
        categorias: [],
        ediciones: []
      };
    });
    afterAll(() => { datosPromociones = null; });

    it("→ 409 'cambia sus fechas desde Campañas'", async () => {
      await expect(validarPromocionesDelDiseno(TIENDA, [aniv({ fin: "2026-12-01" })], ahora)).rejects.toMatchObject({
        statusCode: 409,
        message: "Aniversario tiene una promoción confirmada: cambia sus fechas desde Campañas"
      });
    });

    it("cambiar el aspecto o apagarla pasa", async () => {
      await expect(validarPromocionesDelDiseno(TIENDA, [aniv({ topBar: "Hoy", activa: false })], ahora)).resolves.toBeUndefined();
    });
  });
});
