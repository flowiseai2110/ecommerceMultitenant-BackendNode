import { jest } from "@jest/globals";

jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, default: {} }));
const { verticalHotel } = await import("../hotel/vertical.js");

// docs/specs/reserva-directa-hotel RD1: con inventario decide el sistema.
describe("verticalHotel.modoConfirmacion", () => {
  const inventario = { productoId: "p", unidades: 3, fecha: "2026-11-13", noches: 2 };

  it("un tipo con inventario se reserva directo aunque la tienda esté en modo solicitud", () => {
    expect(verticalHotel.modoConfirmacion({ modoConfirmacion: "solicitud" }, { inventario })).toBe("pago_directo");
    expect(verticalHotel.modoConfirmacion({ modoConfirmacion: "pago_directo" }, { inventario })).toBe("pago_directo");
  });

  it("sin inventario rige la configuración de la tienda (el hotel confirma por WhatsApp)", () => {
    expect(verticalHotel.modoConfirmacion({ modoConfirmacion: "solicitud" }, { inventario: null })).toBe("solicitud");
    expect(verticalHotel.modoConfirmacion({ modoConfirmacion: "pago_directo" }, { inventario: null })).toBe("pago_directo");
  });
});

// La revalidación dentro de la transacción no cuenta la reserva que se está creando.
describe("verticalHotel.enTransaccion", () => {
  it("revalida el cupo sin contar la propia reserva", async () => {
    const inventario = { productoId: "p", unidades: 1, fecha: "2026-11-13", noches: 2 };
    const tx = {
      $queryRaw: jest.fn(async () => []),
      reservas: { findMany: jest.fn(async () => []) },
      hotel_estadias: { findMany: jest.fn(async () => []) },
      hotel_cupo_externo: { findMany: jest.fn(async () => []) }
    };
    await verticalHotel.enTransaccion(tx, { tiendaId: "t", pedidoId: "nuevo", c: { habitaciones: 1 }, estadoInicial: "confirmada", ahora: new Date("2026-10-13T12:00:00Z"), inventario });
    expect(tx.reservas.findMany.mock.calls[0][0].where.pedidoId).toEqual({ not: "nuevo" });
  });
});
