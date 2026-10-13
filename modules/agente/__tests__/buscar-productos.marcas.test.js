import { jest } from "@jest/globals";

// Lógica pura: la tool importa prisma (cliente generado .ts que Jest no parsea).
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {} }));
const { buildBuscarProductosToolDef, idDeMarca } = await import("../tools/buscar-productos.js");

const marcas = [
  { id: "11111111-1111-4111-8111-111111111111", nombre: "Nike" },
  { id: "22222222-2222-4222-8222-222222222222", nombre: "Adidas" }
];

describe("idDeMarca", () => {
  it("encuentra la marca de la tienda sin importar mayúsculas ni espacios", () => {
    expect(idDeMarca(" nike ", marcas)).toBe(marcas[0].id);
  });

  it("ignora una marca que la tienda no tiene o input mal formado", () => {
    expect(idDeMarca("Puma", marcas)).toBeNull();
    expect(idDeMarca(3, marcas)).toBeNull();
    expect(idDeMarca("", marcas)).toBeNull();
  });
});

describe("buildBuscarProductosToolDef con marcas", () => {
  it("expone las marcas de la tienda como enum", () => {
    const def = buildBuscarProductosToolDef({ categorias: [], colores: [], marcas });
    expect(def.input_schema.properties.marca.enum).toEqual(["Nike", "Adidas"]);
  });

  it("sin marcas (otros rubros o tienda sin cargar) no agrega el filtro", () => {
    expect(buildBuscarProductosToolDef({ categorias: [], colores: [] }).input_schema.properties.marca).toBeUndefined();
  });
});
