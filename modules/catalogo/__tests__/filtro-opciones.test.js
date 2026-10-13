import { jest } from "@jest/globals";

// Filtro por talla, color… (docs/specs/plantillas-por-rubro E9).
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {}, default: {} }));
const { parsearOpciones, whereOpciones } = await import("../filtro-opciones.js");
const { default: GenericService } = await import("../../../services/generic.service.js");

test("agrupa por opción: O dentro de la opción, Y entre opciones", () => {
  expect(parsearOpciones("Talla:M,Talla:L,Color:Negro,Talla:M")).toEqual([
    { nombre: "Talla", valores: ["M", "L"] },
    { nombre: "Color", valores: ["Negro"] }
  ]);
});

test("ignora lo mal formado", () => {
  expect(parsearOpciones("Talla,:M,Color:, ,Talla:XL")).toEqual([{ nombre: "Talla", valores: ["XL"] }]);
  expect(whereOpciones("")).toBeNull();
});

test("busca una variante activa con stock que cumpla todas las opciones", () => {
  expect(whereOpciones("Talla:M,Talla:L,Color:Negro")).toEqual({
    variantes: {
      some: {
        activo: true,
        stock: { gt: 0 },
        AND: [
          { OR: [{ atributos: { path: ["Talla"], equals: "M" } }, { atributos: { path: ["Talla"], equals: "L" } }] },
          { OR: [{ atributos: { path: ["Color"], equals: "Negro" } }] }
        ]
      }
    }
  });
});

test("el servicio genérico suma los filtros a medida con AND", () => {
  const svc = new GenericService({}, { allowedFilters: ["activo"], customFilters: { opcion: whereOpciones } });
  const where = svc.buildWhereClause({ activo: "true", opcion: "Color:Negro", otro: "x" });
  expect(where.activo).toBe(true);
  expect(where.AND).toHaveLength(1);
  expect(where.otro).toBeUndefined();
});
