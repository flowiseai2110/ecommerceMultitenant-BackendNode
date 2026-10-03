import { precioEfectivo, indicadoresPrecio, contienePrecio } from "../precios.js";

const p = (id, precioBase, precioOferta = null) => ({ id, precioBase, precioOferta });

describe("precioEfectivo", () => {
  it("usa la oferta si es menor que el precio base", () => {
    expect(precioEfectivo(p("a", "250.00", "180.00"))).toBe(180);
  });

  it("ignora ofertas nulas, en cero o mayores al base", () => {
    expect(precioEfectivo(p("a", 250))).toBe(250);
    expect(precioEfectivo(p("a", 250, 0))).toBe(250);
    expect(precioEfectivo(p("a", 250, 300))).toBe(250);
  });
});

describe("indicadoresPrecio", () => {
  const productos = [p("cara", 300), p("oferta", 250, 180), p("barata", 150)];

  it("marca oferta y la más económica según el precio efectivo", () => {
    const ind = indicadoresPrecio(productos);
    expect(ind.get("oferta")).toEqual({ tiene_oferta: true, es_la_mas_economica: false });
    expect(ind.get("barata")).toEqual({ tiene_oferta: false, es_la_mas_economica: true });
    expect(ind.get("cara").es_la_mas_economica).toBe(false);
  });

  it("con presupuesto agrega dentro_de_presupuesto (la oferta cuenta)", () => {
    const ind = indicadoresPrecio(productos, 200);
    expect(ind.get("oferta").dentro_de_presupuesto).toBe(true);
    expect(ind.get("cara").dentro_de_presupuesto).toBe(false);
  });

  it("sin presupuesto no inventa el indicador", () => {
    expect(indicadoresPrecio(productos).get("cara")).not.toHaveProperty("dentro_de_presupuesto");
  });

  it("con un solo resultado no lo llama 'la más económica'", () => {
    expect(indicadoresPrecio([p("solo", 100)]).get("solo").es_la_mas_economica).toBe(false);
  });

  it("los precios no viajan en los indicadores", () => {
    const valores = Object.values(indicadoresPrecio(productos, 200).get("cara"));
    expect(valores.every(v => typeof v === "boolean")).toBe(true);
  });
});

describe("contienePrecio", () => {
  it.each(["Cuesta S/ 199", "a S/.150 nomás", "solo 120 soles", "$50", "USD 20", "PEN 80", "soles 99"])(
    "detecta «%s»",
    (t) => expect(contienePrecio(t)).toBe(true)
  );

  it.each([
    "Te recomiendo la Running Boost en talla 40",
    "Tengo 3 opciones para ti",
    "Está en oferta y es la más económica",
    "Entrega en 48 horas"
  ])("no confunde «%s» con un precio", (t) => expect(contienePrecio(t)).toBe(false));
});
