import { expandirConsulta } from "../glosario.js";

describe("expandirConsulta", () => {
  it("agrega el término del catálogo sin quitar la jerga", () => {
    expect(expandirConsulta("zapas negras", "moda")).toBe("zapas negras zapatillas");
  });

  it("quita muletillas que solo meten ruido al FTS", () => {
    expect(expandirConsulta("unas zapas pa correr pe, bacán", "moda")).toBe("unas zapas correr zapatillas");
  });

  it("usa el glosario del rubro de la tienda", () => {
    expect(expandirConsulta("chompa", "moda")).toBe("chompa sueter");
    expect(expandirConsulta("audis bluetooth", "tecnologia")).toBe("audis bluetooth audifonos");
    expect(expandirConsulta("croquetas para michi", "mascotas"))
      .toBe("croquetas para michi alimento comida gato");
  });

  it("sin rubro (o desconocido) aplica solo lo común", () => {
    expect(expandirConsulta("chompa zapas", null)).toBe("chompa zapas zapatillas");
    expect(expandirConsulta("chompa", "otro")).toBe("chompa");
  });

  it("no duplica términos", () => {
    expect(expandirConsulta("zapas zapatillas", "moda")).toBe("zapas zapatillas");
  });

  it("reconoce la jerga con mayúsculas y conserva las tildes del cliente", () => {
    expect(expandirConsulta("ZAPAS Rojas", "moda")).toBe("zapas rojas zapatillas");
    expect(expandirConsulta("zapatilla clásica", "moda")).toBe("zapatilla clásica");
  });
});
