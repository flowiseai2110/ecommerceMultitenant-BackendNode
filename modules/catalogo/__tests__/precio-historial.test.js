import { subidasEnVentana, tieneHistorial, restarDias } from "../precio-historial.js";

const inicio = "2026-11-20T00:00:00Z";
const ventana = { desde: restarDias(inicio), hasta: inicio };
const cambio = (fecha, antes, ahora, extra = {}) => ({
  productoId: "p1", varianteId: null, motivo: "cambio", precioAnterior: antes, precioNuevo: ahora, fecha, ...extra
});

describe("subidasEnVentana", () => {
  it("subida el 10 nov con inicio 20 nov: aviso (CA-10.2)", () => {
    const r = subidasEnVentana([cambio("2026-11-10T12:00:00Z", "80.00", "100.00")], ventana);
    expect(r).toHaveLength(1);
  });

  it("última subida el 15 oct (más de 30 días): sin aviso (CA-10.3)", () => {
    expect(subidasEnVentana([cambio("2026-10-15T12:00:00Z", 80, 100)], ventana)).toEqual([]);
  });

  it("una bajada no cuenta", () => {
    expect(subidasEnVentana([cambio("2026-11-10T12:00:00Z", 100, 80)], ventana)).toEqual([]);
  });

  it("variante con precio null (usa el del producto) no cuenta", () => {
    const filas = [
      cambio("2026-11-10T12:00:00Z", null, 90, { varianteId: "v1" }),
      cambio("2026-11-11T12:00:00Z", 90, null, { varianteId: "v1" })
    ];
    expect(subidasEnVentana(filas, ventana)).toEqual([]);
  });

  it("una variante que sube sí cuenta", () => {
    const filas = [cambio("2026-11-10T12:00:00Z", 50, 60, { varianteId: "v1" })];
    expect(subidasEnVentana(filas, ventana)).toHaveLength(1);
  });

  it("alta y línea base no son subidas; cambios posteriores al inicio tampoco", () => {
    const filas = [
      { productoId: "p1", motivo: "alta", precioAnterior: null, precioNuevo: 100, fecha: "2026-11-05T00:00:00Z" },
      { productoId: "p1", motivo: "linea_base", precioAnterior: null, precioNuevo: 100, fecha: "2026-11-05T00:00:00Z" },
      cambio("2026-11-21T00:00:00Z", 100, 120)
    ];
    expect(subidasEnVentana(filas, ventana)).toEqual([]);
  });

  it("sin historial devuelve vacío", () => {
    expect(subidasEnVentana(undefined, ventana)).toEqual([]);
  });
});

describe("tieneHistorial", () => {
  const base = (fecha) => ({ productoId: "p1", motivo: "linea_base", precioNuevo: 100, fecha });

  it("solo línea base de hace 10 días: historial insuficiente (CA-10.5)", () => {
    expect(tieneHistorial([base("2026-11-10T00:00:00Z")], inicio)).toBe(false);
  });

  it("primer registro de hace 40 días: suficiente", () => {
    expect(tieneHistorial([base("2026-10-10T00:00:00Z")], inicio)).toBe(true);
  });

  it("justo 30 días antes cuenta", () => {
    expect(tieneHistorial([base("2026-10-21T00:00:00Z")], inicio)).toBe(true);
  });

  it("sin filas: no hay historial", () => {
    expect(tieneHistorial([], inicio)).toBe(false);
  });
});
