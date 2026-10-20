import { jest } from "@jest/globals";

// Las invalidaciones de rubros e idiomas traen Prisma: aquí no se usan.
jest.unstable_mockModule("../../negocio/rubros.cache.js", () => ({ invalidarRubrosCache: jest.fn() }));
jest.unstable_mockModule("../../idiomas/idiomas-tienda.js", () => ({ invalidarIdiomasDeTienda: jest.fn() }));
const { getTiendasStore, setTiendasStore, invalidateTiendasStoreCache } = await import("../tiendas.cache.js");

// La respuesta de /store/tiendas no se sirve desde memoria pasada su frontera (campanas-cuando R3.9.1).
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

describe("tiendas.cache: TTL según el próximo cambio", () => {
  afterEach(() => invalidateTiendasStoreCache());

  it("vive lo que falta para el cambio, no los 60 s fijos", async () => {
    setTiendasStore("k", { v: 1 }, 30);
    expect(getTiendasStore("k")).toEqual({ v: 1 });
    await esperar(80);
    expect(getTiendasStore("k")).toBeUndefined();
  });

  it("sin TTL (sin cambio cercano) se guarda con el de siempre", async () => {
    setTiendasStore("j", { v: 2 });
    await esperar(50);
    expect(getTiendasStore("j")).toEqual({ v: 2 });
  });

  it("un TTL no positivo no guarda nada", () => {
    setTiendasStore("k", { v: 1 }, 0);
    expect(getTiendasStore("k")).toBeUndefined();
  });
});
