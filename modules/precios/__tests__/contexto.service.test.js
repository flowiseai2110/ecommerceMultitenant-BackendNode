import { jest } from "@jest/globals";

// Cargador del contexto de precios (docs/specs/campanas-descuento C3a). BD simulada.
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: {}, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {}, default: {} }));
jest.unstable_mockModule("../../campanas/ediciones.service.js", () => ({ edicionesParaResolver: async () => [] }));

const { contextoDePrecios } = await import("../contexto.service.js");
const { invalidarContexto, invalidarTodo } = await import("../contexto.cache.js");

const TIENDA = "11111111-1111-4111-8111-111111111111";
const lima = (texto) => new Date(`${texto}:00-05:00`);

let promociones;
const db = {
  campana_promociones: {
    findFirst: jest.fn(async () => (promociones.length ? { id: promociones[0].id } : null)),
    findMany: jest.fn(async () => promociones)
  },
  tienda_configuraciones: {
    findFirst: jest.fn(async () => ({ valor: [{ id: "c-aniv", activa: true, nombre: "Aniversario", inicio: "2026-11-20", fin: "2026-11-30" }] }))
  },
  campana_promocion_categorias: { findMany: jest.fn(async () => [{ promocionId: "p1", categoriaId: "zap" }]) },
  campana_promocion_productos: { findMany: jest.fn(async () => []) },
  campana_promocion_confirmaciones: {
    findMany: jest.fn(async () => [
      { promocionId: "p1", promocionVersion: 1, ventanaInicio: lima("2026-11-20T00:00"), ventanaFin: lima("2026-12-01T00:00") }
    ])
  },
  categorias: { findMany: jest.fn(async () => [{ id: "zap", categoriaPadreId: null }, { id: "running", categoriaPadreId: "zap" }]) }
};

beforeEach(() => {
  promociones = [];
  invalidarTodo();
  jest.clearAllMocks();
});

describe("contextoDePrecios", () => {
  it("tienda sin promociones: una sola consulta y lista vacía", async () => {
    const ctx = await contextoDePrecios(db, TIENDA, { ahora: lima("2026-11-25T12:00") });
    expect(ctx).toMatchObject({ promociones: [], proximoCambio: null });
    expect(db.campana_promociones.findMany).not.toHaveBeenCalled();
  });

  it("con promoción confirmada: la vigente con sus subcategorías y la próxima frontera; todo con tienda_id", async () => {
    promociones = [{ id: "p1", campanaId: "c-aniv", porcentaje: 20, alcance: "categorias", permitirCupones: false, permitirEnvioGratis: false, version: 1 }];
    const ctx = await contextoDePrecios(db, TIENDA, { ahora: lima("2026-11-25T12:00") });
    expect(ctx.promociones).toHaveLength(1);
    expect([...ctx.promociones[0].alcance.categoriaIds].sort()).toEqual(["running", "zap"]);
    expect(ctx.proximoCambio).toEqual(lima("2026-12-01T00:00"));
    for (const tabla of ["campana_promociones", "campana_promocion_categorias", "campana_promocion_productos", "campana_promocion_confirmaciones", "categorias"]) {
      expect(db[tabla].findMany.mock.calls[0][0].where.tiendaId).toBe(TIENDA);
    }
  });

  it("la vitrina usa la caché; cotizar (conCache: false) siempre lee", async () => {
    const ahora = lima("2026-11-25T12:00");
    await contextoDePrecios(db, TIENDA, { ahora });
    await contextoDePrecios(db, TIENDA, { ahora });
    expect(db.campana_promociones.findFirst).toHaveBeenCalledTimes(1);
    await contextoDePrecios(db, TIENDA, { ahora, conCache: false });
    expect(db.campana_promociones.findFirst).toHaveBeenCalledTimes(2);
    invalidarContexto(TIENDA);
    await contextoDePrecios(db, TIENDA, { ahora });
    expect(db.campana_promociones.findFirst).toHaveBeenCalledTimes(3);
  });

  it("si la tabla no responde, la vitrina sigue sin promociones y cotizar falla", async () => {
    db.campana_promociones.findFirst.mockRejectedValueOnce(new Error("no existe la tabla"));
    expect((await contextoDePrecios(db, TIENDA)).promociones).toEqual([]);
    db.campana_promociones.findFirst.mockRejectedValueOnce(new Error("no existe la tabla"));
    await expect(contextoDePrecios(db, TIENDA, { conCache: false })).rejects.toThrow("no existe la tabla");
  });

  it("sin tienda no consulta nada", async () => {
    expect((await contextoDePrecios(db, null)).promociones).toEqual([]);
    expect(db.campana_promociones.findFirst).not.toHaveBeenCalled();
  });
});
