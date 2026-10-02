import { jest } from "@jest/globals";

// La tool importa prisma (cliente generado .ts que Jest no parsea); estas
// pruebas son de lógica pura y no tocan la BD.
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {} }));
const { buildBuscarProductosToolDef, opcionesPedidas } = await import("../tools/buscar-productos.js");

const facetasOpciones = [
  { clave: "talla", valores: ["S", "M", "L"] },
  { clave: "tamano", valores: ["50 ml", "100 ml"] }
];

describe("opcionesPedidas", () => {
  it("devuelve el valor real de la tienda sin importar mayúsculas", () => {
    expect(opcionesPedidas({ talla: "m" }, facetasOpciones)).toEqual([["talla", "M"]]);
  });

  it("ignora claves y valores que la tienda no tiene", () => {
    expect(opcionesPedidas({ talla: "XXL", sabor: "fresa" }, facetasOpciones)).toEqual([]);
  });

  it("ignora input mal formado del modelo", () => {
    expect(opcionesPedidas(null, facetasOpciones)).toEqual([]);
    expect(opcionesPedidas(["talla"], facetasOpciones)).toEqual([]);
    expect(opcionesPedidas({ talla: 3 }, facetasOpciones)).toEqual([]);
  });
});

describe("buildBuscarProductosToolDef con opciones", () => {
  it("expone cada opción de la tienda como enum", () => {
    const def = buildBuscarProductosToolDef({ categorias: [], colores: [], opciones: facetasOpciones });
    const opciones = def.input_schema.properties.opciones;
    expect(opciones.properties.talla.enum).toEqual(["S", "M", "L"]);
    expect(opciones.properties.tamano.enum).toEqual(["50 ml", "100 ml"]);
    expect(opciones.additionalProperties).toBe(false);
  });

  it("no agrega el filtro si la tienda no tiene variantes con opciones", () => {
    const def = buildBuscarProductosToolDef({ categorias: [], colores: [] });
    expect(def.input_schema.properties.opciones).toBeUndefined();
  });
});
