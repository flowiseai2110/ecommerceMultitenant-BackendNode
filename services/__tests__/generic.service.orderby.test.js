import GenericService from "../generic.service.js";

const repo = {};

describe("GenericService.parseOrderBy", () => {
  const service = new GenericService(repo, {
    allowedOrderBy: ["precioBase", "ratingScore"],
    orderByTiebreakers: { ratingScore: [{ ratingCantidad: "desc" }, { id: "asc" }] }
  });

  it("sin desempate configurado devuelve un solo criterio (comportamiento de siempre)", () => {
    expect(service.parseOrderBy("precioBase:asc")).toEqual({ precioBase: "asc" });
  });

  it("con desempate devuelve el criterio principal seguido de los desempates", () => {
    expect(service.parseOrderBy("ratingScore:desc")).toEqual([
      { ratingScore: "desc" },
      { ratingCantidad: "desc" },
      { id: "asc" }
    ]);
  });

  it("un campo fuera de la whitelist se ignora (cae al orden por defecto)", () => {
    expect(service.parseOrderBy("precioCosto:desc")).toBeUndefined();
  });

  it("una dirección inválida se ignora", () => {
    expect(service.parseOrderBy("ratingScore:sideways")).toBeUndefined();
  });

  it("los servicios sin la opción no cambian", () => {
    const legacy = new GenericService(repo, {});
    expect(legacy.parseOrderBy("nombre:desc")).toEqual({ nombre: "desc" });
  });
});
