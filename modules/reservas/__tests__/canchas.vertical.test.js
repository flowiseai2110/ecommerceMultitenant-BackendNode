import { jest } from "@jest/globals";

// La ocupación del horario sigue al estado de la reserva (alquiler-canchas R4, R5):
// la reserva aparta la cancha al crearse, la captura detiene el vencimiento, el
// pago verificado la vuelve reserva, el pago rechazado da un plazo nuevo y
// cancelar o rechazar la libera. La BD (23P01) decide si el horario sigue libre.

const TIENDA = "22222222-2222-4222-8222-222222222222";
const CANCHA = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "77777777-7777-4777-8777-777777777777";
const lima = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`);

const prisma = {
  productos: {
    findFirst: jest.fn(async () => ({
      id: CANCHA, nombre: "Cancha 1",
      cancha: { formato: "F7", largoM: 45, anchoM: 25, jugadoresMax: 16, techada: false, superficie: null, precioDia: 120, precioNoche: 160 }
    }))
  },
  cancha_ocupaciones: { findMany: jest.fn(async () => []) },
  cierres_fecha: { findMany: jest.fn(async () => []) }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));

const config = {
  canchaApertura: "07:00", canchaCierre: "23:00", canchaInicioNoche: "18:00", canchaFindeNoche: true, canchaDuraciones: [60, 90, 120],
  anticipacionMinHoras: 0, cobro: "adelanto", adelantoPct: 50, apartadoManualMin: 30, avisoProximoHoras: null, avisoProximoTexto: ""
};
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn(async () => config) }));

const { verticalCanchas } = await import("../canchas/vertical.js");

const tx = () => ({
  $executeRaw: jest.fn(async () => 0),
  $queryRaw: jest.fn(async () => [{ id: "ocu-1" }]),
  cancha_ocupaciones: { updateMany: jest.fn(async () => ({ count: 1 })) },
  reservas: { update: jest.fn(async () => ({})) }
});
const pedido = {
  id: PEDIDO, tiendaId: TIENDA, tipo: "cancha",
  reserva: { productoId: CANCHA, inicio: lima("2026-10-12", "19:00"), fin: lima("2026-10-12", "20:30") }
};
const ahora = lima("2026-10-12", "09:00");

describe("verticalCanchas.cotizar", () => {
  it("cotiza con la ficha y guarda la foto de la reserva", async () => {
    const { producto, c, detalle } = await verticalCanchas.cotizar({
      tiendaId: TIENDA, datos: { productoId: CANCHA, fecha: "2026-10-12", hora: "19:00", duracionMin: 90 }, config, ahora
    });
    expect(producto).toEqual({ id: CANCHA, nombre: "Cancha 1" });
    expect(c.total).toBe(240);
    expect(detalle.cancha).toEqual(expect.objectContaining({ formato: "F7", duracionMin: 90, nombre: "Cancha 1" }));
  });
});

describe("apartado y ocupación", () => {
  it("la reserva por pagar aparta la cancha 30 min (nunca después del inicio)", () => {
    const c = { inicio: pedido.reserva.inicio };
    expect(verticalCanchas.apartadoInicial("aceptada", c, config, ahora)).toEqual(lima("2026-10-12", "09:30"));
    expect(verticalCanchas.apartadoInicial("aceptada", c, config, lima("2026-10-12", "18:50"))).toEqual(c.inicio);
    expect(verticalCanchas.apartadoInicial("confirmada", c, config, ahora)).toBeNull();
    // Modo solicitud: apartado mientras el negocio responde (respuestaHoras), tope el inicio.
    expect(verticalCanchas.apartadoInicial("solicitada", c, { ...config, respuestaHoras: 2 }, ahora)).toEqual(lima("2026-10-12", "11:00"));
    expect(verticalCanchas.apartadoInicial("solicitada", c, { ...config, respuestaHoras: 24 }, ahora)).toEqual(c.inicio);
  });

  it("al crear ocupa el horario dentro de la transacción", async () => {
    const t = tx();
    await verticalCanchas.enTransaccion(t, {
      tiendaId: TIENDA, pedidoId: PEDIDO, estadoInicial: "aceptada", apartadoHasta: lima("2026-10-12", "09:30"),
      c: { inicio: pedido.reserva.inicio, fin: pedido.reserva.fin }, cotizado: { producto: { id: CANCHA } }
    });
    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    const valores = t.$queryRaw.mock.calls[0].slice(1);
    expect(valores).toEqual(expect.arrayContaining([TIENDA, CANCHA, PEDIDO, "apartado"]));
  });

  it("el 23P01 de la BD es un 409 HORARIO_OCUPADO", async () => {
    const t = tx();
    t.$queryRaw.mockRejectedValueOnce(Object.assign(new Error("conflicting key value violates exclusion constraint"), { code: "23P01" }));
    await expect(verticalCanchas.enTransaccion(t, {
      tiendaId: TIENDA, pedidoId: PEDIDO, estadoInicial: "aceptada", apartadoHasta: null,
      c: { inicio: pedido.reserva.inicio, fin: pedido.reserva.fin }, cotizado: { producto: { id: CANCHA } }
    })).rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ motivo: "HORARIO_OCUPADO" }) });
  });
});

describe("alCambiarEstado (R5)", () => {
  it("captura subida: el apartado deja de vencer", async () => {
    const t = tx();
    await verticalCanchas.alCambiarEstado(t, { pedido, nuevo: "pago_en_revision", ahora });
    expect(t.cancha_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { tipo: "apartado", expiraEn: null } });
  });

  it("pago verificado: pasa a reserva; si la fila ya no estaba, la vuelve a ocupar", async () => {
    const t = tx();
    t.cancha_ocupaciones.updateMany.mockResolvedValueOnce({ count: 0 });
    await verticalCanchas.alCambiarEstado(t, { pedido, nuevo: "confirmada", ahora });
    expect(t.cancha_ocupaciones.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { tipo: "reserva", expiraEn: null } }));
    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("pago rechazado: nuevo plazo para pagar en la ocupación y en la reserva", async () => {
    const t = tx();
    await verticalCanchas.alCambiarEstado(t, { pedido, nuevo: "aceptada", ahora });
    const expira = lima("2026-10-12", "09:30");
    expect(t.cancha_ocupaciones.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { tipo: "apartado", expiraEn: expira } }));
    expect(t.reservas.update).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO }, data: { apartadoHasta: expira } });
  });

  it.each(["cancelada", "rechazada"])("%s libera el horario", async (nuevo) => {
    const t = tx();
    await verticalCanchas.alCambiarEstado(t, { pedido, nuevo, ahora });
    expect(t.cancha_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { activo: false } });
  });

  it("no_show no toca la ocupación (el horario ya pasó)", async () => {
    const t = tx();
    await verticalCanchas.alCambiarEstado(t, { pedido, nuevo: "no_show", ahora });
    expect(t.cancha_ocupaciones.updateMany).not.toHaveBeenCalled();
  });
});
