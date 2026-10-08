import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { nochesDe, ocupaCupo, unidadesDe } = await import("../hotel/disponibilidad.service.js");

// docs/specs/hospedaje-completo C1: qué ocupa el inventario.
describe("disponibilidad", () => {
  const ahora = new Date("2026-09-24T12:00:00-05:00");

  it("ocupan las aceptadas, en revisión y confirmadas; no las solicitudes ni las anuladas", () => {
    expect(ocupaCupo({ estado: "confirmada", apartadoHasta: null }, ahora)).toBe(true);
    expect(ocupaCupo({ estado: "pago_en_revision", apartadoHasta: null }, ahora)).toBe(true);
    expect(ocupaCupo({ estado: "solicitada", apartadoHasta: null }, ahora)).toBe(false);
    expect(ocupaCupo({ estado: "cancelada", apartadoHasta: null }, ahora)).toBe(false);
  });

  it("una aceptada apartada deja de ocupar al vencer el apartado", () => {
    expect(ocupaCupo({ estado: "aceptada", apartadoHasta: new Date("2026-09-24T13:00:00-05:00") }, ahora)).toBe(true);
    expect(ocupaCupo({ estado: "aceptada", apartadoHasta: new Date("2026-09-24T11:00:00-05:00") }, ahora)).toBe(false);
  });

  it("las noches de una estadía y las unidades que consume", () => {
    expect(nochesDe("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(unidadesDe({ adultos: 2, ninos: 1, habitaciones: 1 }, true)).toBe(3);
    expect(unidadesDe({ adultos: 4, ninos: 0, habitaciones: 2 }, false)).toBe(2);
  });
});
