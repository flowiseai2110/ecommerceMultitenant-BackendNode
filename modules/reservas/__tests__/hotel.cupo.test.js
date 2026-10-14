import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
jest.unstable_mockModule("../reservas.service.js", () => ({ INCLUDE_RESERVA: { reserva: { include: {} }, cuotas: true } }));
const { calcularManual } = await import("../hotel/cupo.service.js");
const { ocupacion, solicitudesPorNoche } = await import("../hotel/disponibilidad.service.js");
const { instanteLima } = await import("../tiempo.js");

// docs/specs/motor-reservas-hotel M2: lo vendido fuera de la web ocupa cupo.
describe("cupo a la venta", () => {
  const ahora = new Date("2026-10-14T12:00:00-05:00");
  const tipo = { productoId: "tipo-1", unidades: 5 };

  const db = ({ reservas = [], externas = [] } = {}) => ({
    reservas: { findMany: jest.fn(async () => reservas) },
    hotel_estadias: { findMany: jest.fn(async () => []) },
    hotel_cupo_externo: { findMany: jest.fn(async () => externas) }
  });
  const reserva = (fecha, noches, estado = "confirmada", habitaciones = 1) => ({
    productoId: "tipo-1", inicio: instanteLima(fecha, "14:00"), noches, habitaciones, apartadoHasta: null, pedido: { estado }
  });
  const externa = (fecha, ocupadas, origen = "manual") => ({
    productoId: "tipo-1", fecha: new Date(`${fecha}T00:00:00Z`), origen, ocupadas
  });

  describe("calcularManual", () => {
    it("guarda como ocupadas fuera de la web lo que falta para los libres pedidos", () => {
      // 5 habitaciones, 1 vendida en la web: el dueño dice que le quedan 2.
      expect(calcularManual({ unidades: 5, enSistema: 1, ical: 0, libres: 2 }))
        .toEqual({ manual: 2, libres: 2, maximo: 4, ajustada: false });
    });

    it("todas libres en la web: no guarda nada", () => {
      expect(calcularManual({ unidades: 5, enSistema: 1, ical: 0, libres: 4 }).manual).toBe(0);
    });

    it("no ofrece más de lo que dejan la web y el iCal: ofrece el máximo y avisa", () => {
      expect(calcularManual({ unidades: 5, enSistema: 2, ical: 1, libres: 4 }))
        .toEqual({ manual: 0, libres: 2, maximo: 2, ajustada: true });
    });

    it("sobrevendida: el máximo es 0, nunca negativo", () => {
      expect(calcularManual({ unidades: 2, enSistema: 3, ical: 0, libres: 1 }))
        .toEqual({ manual: 0, libres: 0, maximo: 0, ajustada: true });
    });
  });

  describe("ocupacion", () => {
    it("suma lo vendido fuera de la web (manual e iCal) a las reservas", async () => {
      const mapa = await ocupacion(
        db({ reservas: [reserva("2026-10-16", 2)], externas: [externa("2026-10-16", 2), externa("2026-10-17", 1, "ical")] }),
        "tienda", [tipo], "2026-10-16", "2026-10-18", { ahora }
      );
      expect(Object.fromEntries(mapa.get("tipo-1"))).toEqual({ "2026-10-16": 3, "2026-10-17": 2 });
    });

    it("`externas: false` cuenta solo la web y el mostrador", async () => {
      const d = db({ reservas: [reserva("2026-10-16", 1)], externas: [externa("2026-10-16", 2)] });
      const mapa = await ocupacion(d, "tienda", [tipo], "2026-10-16", "2026-10-16", { ahora, externas: false });
      expect(mapa.get("tipo-1").get("2026-10-16")).toBe(1);
      expect(d.hotel_cupo_externo.findMany).not.toHaveBeenCalled();
    });

    it("un tipo sin reservas web también ocupa por lo de afuera", async () => {
      const mapa = await ocupacion(db({ externas: [externa("2026-10-20", 5)] }), "tienda", [tipo], "2026-10-20", "2026-10-20", { ahora });
      expect(mapa.get("tipo-1").get("2026-10-20")).toBe(5);
    });
  });

  it("solicitudesPorNoche: las habitaciones pedidas por noche dentro del rango", async () => {
    const mapa = await solicitudesPorNoche(
      db({ reservas: [{ productoId: "tipo-1", inicio: instanteLima("2026-10-15", "14:00"), noches: 3, habitaciones: 2 }] }),
      "tienda", ["tipo-1"], "2026-10-16", "2026-10-20"
    );
    expect(Object.fromEntries(mapa.get("tipo-1"))).toEqual({ "2026-10-16": 2, "2026-10-17": 2 });
  });
});
