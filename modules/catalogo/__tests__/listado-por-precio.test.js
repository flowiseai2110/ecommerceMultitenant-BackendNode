import { pedidoPorPrecio, sinPrecio, ordenarPorPrecio } from "../listado-por-precio.js";

// Orden y rango del catálogo por el precio que se cobra (docs/specs/campanas-descuento C3a, E4). Puro.
const promo = {
  campanaId: "bf", nombre: "Black Friday", porcentaje: 20, orden: 0, hasta: new Date("2026-12-01T05:00:00Z"),
  permitirCupones: false, permitirEnvioGratis: false,
  alcance: { tipo: "categorias", elegidas: ["zap"], categoriaIds: new Set(["zap"]), productoIds: new Set() }
};
const filas = [
  { id: "a-zapatilla", categoriaId: "zap", precioBase: "100.00", precioOferta: null }, // 80 con la promoción
  { id: "b-polo", categoriaId: "polos", precioBase: "90.00", precioOferta: null },    // 90
  { id: "c-casaca", categoriaId: "polos", precioBase: "120.00", precioOferta: "75.00" }, // 75 con su oferta
  { id: "d-gorra", categoriaId: "polos", precioBase: "90.00", precioOferta: null }    // 90 (empata con b)
];
const pagina = { page: 1, limit: 10 };

describe("pedidoPorPrecio", () => {
  it("orden por precioBase o precio (Tienda vieja y nueva) y rango min_/max_", () => {
    expect(pedidoPorPrecio({ orderBy: "precioBase:asc" })).toEqual({ direccion: "asc", min: null, max: null });
    expect(pedidoPorPrecio({ orderBy: "precio:desc" })).toEqual({ direccion: "desc", min: null, max: null });
    expect(pedidoPorPrecio({ min_precioBase: "50", max_precio: "85" })).toEqual({ direccion: null, min: 50, max: 85 });
  });

  it("otro orden y sin rango → null (camino genérico de siempre)", () => {
    expect(pedidoPorPrecio({ orderBy: "nombre:asc" })).toBeNull();
    expect(pedidoPorPrecio({})).toBeNull();
  });

  it("sinPrecio quita orden, rango y paginación por precio; deja lo demás", () => {
    expect(sinPrecio({ orderBy: "precioBase:asc", min_precioBase: "1", page: 2, limit: 5, tiendaId: "t", categoriaId: "zap" }))
      .toEqual({ tiendaId: "t", categoriaId: "zap" });
    expect(sinPrecio({ orderBy: "nombre:asc", max_precio: "9" })).toEqual({ orderBy: "nombre:asc" });
  });
});

describe("ordenarPorPrecio", () => {
  it("menor precio con promoción y con oferta; desempate por id", () => {
    const { ids, total } = ordenarPorPrecio(filas, { direccion: "asc", min: null, max: null }, { promociones: [promo] }, pagina);
    expect(ids).toEqual(["c-casaca", "a-zapatilla", "b-polo", "d-gorra"]);
    expect(total).toBe(4);
  });

  it("mayor precio", () => {
    const { ids } = ordenarPorPrecio(filas, { direccion: "desc", min: null, max: null }, { promociones: [promo] }, pagina);
    expect(ids).toEqual(["b-polo", "d-gorra", "a-zapatilla", "c-casaca"]);
  });

  it("sin promociones la zapatilla vuelve a su precio regular", () => {
    const { ids } = ordenarPorPrecio(filas, { direccion: "asc", min: null, max: null }, {}, pagina);
    expect(ids).toEqual(["c-casaca", "b-polo", "d-gorra", "a-zapatilla"]);
  });

  it("rango por el precio que se cobra, conservando el orden recibido", () => {
    const { ids, total } = ordenarPorPrecio(filas, { direccion: null, min: 70, max: 85 }, { promociones: [promo] }, pagina);
    expect(ids).toEqual(["a-zapatilla", "c-casaca"]);
    expect(total).toBe(2);
  });

  it("pagina después de ordenar", () => {
    const { ids, total } = ordenarPorPrecio(filas, { direccion: "asc", min: null, max: null }, { promociones: [promo] }, { page: 2, limit: 3 });
    expect(ids).toEqual(["d-gorra"]);
    expect(total).toBe(4);
  });
});
