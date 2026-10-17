import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { preciosDelTipo } = await import("../hotel/precios-calendario.js");
const { precioNoche } = await import("../hotel/cotizar.js");

// docs/specs/reserva-hotel-mejoras H1: el precio de cada noche en el calendario.
describe("precio por noche del calendario", () => {
  const TIPO = "t1";
  const noche = { tipo: "noche", precio: 165, precioVieSab: 255, activo: true };
  // 2026-11-05 es jueves; 06 viernes; 07 sábado; 08 domingo.
  const fechas = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

  it("viernes y sábado cuestan lo suyo; la temporada ajusta como en la cotización", () => {
    expect(precioNoche(noche, "2026-11-05").precio).toBe(165);
    expect(precioNoche(noche, "2026-11-06").precio).toBe(255);
    const fiestas = [{ nombre: "Fiestas", desde: "2026-11-08", hasta: "2026-11-08", ajustePct: 20 }];
    expect(precioNoche(noche, "2026-11-08", fiestas)).toEqual({ precio: 198, temporada: fiestas[0] });
  });

  it("toma la modalidad por noche más barata e ignora las inactivas y las de horas", () => {
    const precios = preciosDelTipo(TIPO, [
      noche,
      { tipo: "noche", precio: 150, precioVieSab: null, activo: false },
      { tipo: "horas", precio: 60, precioVieSab: null, activo: true },
      { tipo: "noche", precio: 180, precioVieSab: 200, activo: true }
    ], [], [], fechas);
    expect(precios).toEqual({ "2026-11-05": 165, "2026-11-06": 200, "2026-11-07": 200, "2026-11-08": 165 });
  });

  it("aplica solo las temporadas de ese tipo (vacía = todas)", () => {
    const temporadas = [
      { nombre: "Alta", desde: "2026-11-05", hasta: "2026-11-05", ajustePct: 100, productoIds: ["otro"] },
      { nombre: "Puente", desde: "2026-11-08", hasta: "2026-11-08", ajustePct: 10, productoIds: [] }
    ];
    const precios = preciosDelTipo(TIPO, [noche], temporadas, [], fechas);
    expect(precios["2026-11-05"]).toBe(165);
    expect(precios["2026-11-08"]).toBe(181.5);
  });

  it("las noches cerradas (de la tienda o del tipo) no tienen precio", () => {
    const cierres = [
      { productoId: null, fechaDesde: "2026-11-05", fechaHasta: "2026-11-05" },
      { productoId: TIPO, fechaDesde: "2026-11-07", fechaHasta: "2026-11-07" },
      { productoId: "otro", fechaDesde: "2026-11-08", fechaHasta: "2026-11-08" }
    ];
    expect(preciosDelTipo(TIPO, [noche], [], cierres, fechas)).toEqual({
      "2026-11-05": null, "2026-11-06": 255, "2026-11-07": null, "2026-11-08": 165
    });
  });

  it("un tipo que solo se vende por horas no entra al calendario", () => {
    expect(preciosDelTipo(TIPO, [{ tipo: "horas", precio: 60, activo: true }], [], [], fechas)).toBeNull();
  });
});
