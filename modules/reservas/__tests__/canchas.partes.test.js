import { jest } from "@jest/globals";

// Pago dividido de canchas (docs/specs/plantillas-por-rubro E7): reparto al
// céntimo, link propio por parte y la reserva se confirma cuando lo pagado
// cubre lo que había que pagar al separar.
process.env.RESERVAS_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";

const prisma = {
  reserva_partes: { findFirst: jest.fn(), findMany: jest.fn(async () => []), count: jest.fn(async () => 0), updateMany: jest.fn(async () => ({ count: 1 })) },
  pedidos: { update: jest.fn(async () => ({})) },
  pedido_historial_estados: { create: jest.fn(async () => ({})) },
  tiendas: { findUnique: jest.fn(async () => ({ slug: "los-cedros", nombre: "Los Cedros" })) },
  $transaction: jest.fn(async (fn) => fn(prisma))
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));
const svc = {
  aplicarAccion: jest.fn(async () => "confirmada"),
  correoCliente: jest.fn(async () => {}),
  efectivoDe: jest.fn(() => "aceptada"),
  obtenerSeguimiento: jest.fn(async () => ({})),
  pedidoDeReserva: jest.fn()
};
jest.unstable_mockModule("../reservas.service.js", () => svc);
jest.unstable_mockModule("../reservas.emails.js", () => ({ confirmadaEmail: jest.fn() }));
jest.unstable_mockModule("../../pagos/modo-pago.service.js", () => ({ exigirAutomatico: jest.fn(async () => ({ proveedor: "simulado" })) }));
jest.unstable_mockModule("../../pagos/pasarela/pasarela.service.js", () => ({ default: class { cobrar() {} } }));
jest.unstable_mockModule("../../pagos/pasarela/destinos.js", () => ({ registrarDestino: jest.fn() }));

const { repartir, firmarTokenParte, verificarTokenParte, destinoParte } = await import("../canchas/partes.js");

const pedido = (extra = {}) => ({
  id: "p-1", numeroPedido: "R-1", estado: "aceptada", tipo: "cancha", total: 240, montoPagado: 0, clienteEmail: "c@x.pe",
  reserva: { montoAPagar: 60, inicio: new Date(), fin: null }, ...extra
});

beforeEach(() => jest.clearAllMocks());

test("reparte al céntimo: la última parte absorbe el redondeo", () => {
  expect(repartir(240, 4)).toEqual([60, 60, 60, 60]);
  expect(repartir(100, 3)).toEqual([33.33, 33.33, 33.34]);
  expect(repartir(100, 3).reduce((s, m) => s + m, 0)).toBeCloseTo(100, 2);
});

test("el link de una parte solo sirve para esa parte", async () => {
  const token = await firmarTokenParte({ parteId: "parte-1", tiendaId: "t-1" });
  await expect(verificarTokenParte(token)).resolves.toEqual({ parteId: "parte-1", tiendaId: "t-1" });
  await expect(verificarTokenParte(`${token}x`)).rejects.toMatchObject({ statusCode: 404 });
});

describe("al pagar una parte", () => {
  test("sin cubrir el adelanto la reserva sigue esperando", async () => {
    prisma.reserva_partes.findFirst.mockResolvedValue({ id: "parte-1", pedidoId: "p-1", numero: 1, monto: 30, estado: "pendiente" });
    svc.pedidoDeReserva.mockResolvedValue(pedido());
    const d = await destinoParte("t-1", "parte-1");
    expect(d).toMatchObject({ monto: 30, parteId: "parte-1", pedidoId: "p-1" });
    await d.alPagar({ pago: { monto: 30 }, metodo: "yape", cargoId: "chr_1" });
    expect(svc.aplicarAccion).not.toHaveBeenCalled();
    expect(prisma.pedidos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ montoPagado: 30, estadoPago: "parcial" }) }));
  });

  test("al cubrir el adelanto se confirma", async () => {
    prisma.reserva_partes.findFirst.mockResolvedValue({ id: "parte-2", pedidoId: "p-1", numero: 2, monto: 30, estado: "pendiente" });
    svc.pedidoDeReserva.mockResolvedValue(pedido({ montoPagado: 30 }));
    const d = await destinoParte("t-1", "parte-2");
    await d.alPagar({ pago: { monto: 30 }, metodo: "tarjeta", cargoId: "chr_2" });
    expect(svc.aplicarAccion).toHaveBeenCalledWith(prisma, expect.anything(), "pago_pasarela", expect.objectContaining({
      datosPedido: expect.objectContaining({ montoPagado: 60, referenciaPago: "chr_2" })
    }));
    expect(svc.correoCliente).toHaveBeenCalled();
  });

  test("una parte ya pagada no se cobra otra vez", async () => {
    prisma.reserva_partes.findFirst.mockResolvedValue({ id: "parte-1", pedidoId: "p-1", numero: 1, monto: 30, estado: "pagada" });
    svc.pedidoDeReserva.mockResolvedValue(pedido());
    await expect(destinoParte("t-1", "parte-1")).rejects.toMatchObject({ details: { motivo: "PARTE_PAGADA" } });
  });
});
