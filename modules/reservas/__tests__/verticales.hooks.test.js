import { jest } from "@jest/globals";

// Lo que cada vertical hace al cambiar de estado (docs/specs/antipatrones 3b): el
// servicio común solo llama alCambiarEstado; locales libera su franja y eventos
// mueve sus entradas vendidas.
const prisma = new Proxy({}, { get: () => ({}) });
jest.unstable_mockModule("../../../generated/prisma/client.ts", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} }, PrismaClient: class {} }));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: { sql: () => ({}), join: () => ({}) }, default: prisma }));
const eventosSvc = { apartarEntradas: jest.fn(), cargarFuncionParaCompra: jest.fn(), moverVendidos: jest.fn(async () => {}) };
jest.unstable_mockModule("../eventos/eventos.service.js", () => eventosSvc);
const entradas = { emitirEntradas: jest.fn(async () => {}), anularEntradas: jest.fn(async () => {}) };
jest.unstable_mockModule("../eventos/entradas.js", () => entradas);

const { verticalEventos } = await import("../eventos/vertical.js");
const { verticalLocal } = await import("../locales/locales.service.js");

const pedido = { id: "p1", tiendaId: "t1" };
beforeEach(() => jest.clearAllMocks());

describe("locales: la franja se libera al rechazar o cancelar", () => {
  const tx = () => ({ local_ocupaciones: { updateMany: jest.fn(async () => ({ count: 1 })) } });

  it.each(["rechazada", "cancelada"])("%s libera", async (nuevo) => {
    const t = tx();
    await verticalLocal.alCambiarEstado(t, { pedido, anterior: "solicitada", nuevo });
    expect(t.local_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: "p1", activo: true }, data: { activo: false } });
  });

  it.each(["aceptada", "confirmada", "suspendida", "pago_en_revision"])("%s no libera", async (nuevo) => {
    const t = tx();
    await verticalLocal.alCambiarEstado(t, { pedido, anterior: "solicitada", nuevo });
    expect(t.local_ocupaciones.updateMany).not.toHaveBeenCalled();
  });
});

describe("eventos: entradas vendidas", () => {
  it("al confirmarse, el apartado pasa a vendido y se emiten las entradas", async () => {
    await verticalEventos.alCambiarEstado("tx", { pedido, anterior: "pago_en_revision", nuevo: "confirmada" });
    expect(eventosSvc.moverVendidos).toHaveBeenCalledWith("tx", "t1", "p1", +1);
    expect(entradas.emitirEntradas).toHaveBeenCalled();
  });

  it("cancelar una confirmada devuelve las vendidas; una en revisión no (su cupo era apartado)", async () => {
    await verticalEventos.alCambiarEstado("tx", { pedido, anterior: "confirmada", nuevo: "cancelada" });
    expect(eventosSvc.moverVendidos).toHaveBeenCalledWith("tx", "t1", "p1", -1);
    eventosSvc.moverVendidos.mockClear();
    await verticalEventos.alCambiarEstado("tx", { pedido, anterior: "pago_en_revision", nuevo: "cancelada" });
    expect(eventosSvc.moverVendidos).not.toHaveBeenCalled();
    expect(entradas.anularEntradas).toHaveBeenCalledTimes(2);
  });

  it("la compra no avisa al organizador y tiene su propio texto y sus notas", () => {
    expect(verticalEventos.avisaAlNegocio).toBe(false);
    expect(verticalEventos.mensajeMaxAbiertas(3, "este evento")).toBe("Ya tienes 3 compras pendientes de pago en este evento. Completa o cancela alguna antes de hacer otra.");
    expect(verticalEventos.notasIniciales.confirmada).toBe("Entradas libres confirmadas desde la vitrina");
  });
});
