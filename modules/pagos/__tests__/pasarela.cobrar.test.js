import { jest } from "@jest/globals";

// Cobro de un destino (docs/specs/pago-automatico R3, R5): el monto sale del
// destino, un rechazo da 422 y deja el pago fallido, y `alPagar` corre una sola
// vez aunque la respuesta del cargo y el webhook lleguen los dos.

const pagos = new Map();
const prisma = {
  pagos: {
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async ({ where }) => pagos.get(where.id) ?? null),
    create: jest.fn(async ({ data }) => { const p = { id: `pago-${pagos.size + 1}`, proveedorCargoId: null, ...data }; pagos.set(p.id, p); return p; }),
    update: jest.fn(async ({ where, data }) => Object.assign(pagos.get(where.id), data)),
    updateMany: jest.fn(async ({ where, data }) => {
      const p = pagos.get(where.id);
      if (!p || p.estado === where.estado?.not) return { count: 0 };
      Object.assign(p, data);
      return { count: 1 };
    })
  },
  pago_eventos: { create: jest.fn(async () => ({})), update: jest.fn(async () => ({})) }
};
const PrismaStub = { PrismaClientKnownRequestError: class extends Error {} };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: PrismaStub, default: prisma }));

const provider = {
  requiereCredenciales: false,
  createCharge: jest.fn(),
  getChargeStatus: jest.fn(),
  parseWebhook: (body) => ({ proveedorEventoId: body.id, tipo: body.tipo, chargeId: body.data.id })
};
jest.unstable_mockModule("../pasarela/provider-factory.js", () => ({
  getProvider: () => provider, proveedorPlataforma: () => "simulado", PROVEEDORES_SOPORTADOS: ["culqi", "simulado"]
}));
const destinoWebhook = { current: null };
jest.unstable_mockModule("../pasarela/destinos.js", () => ({
  destinoDePago: async () => destinoWebhook.current,
  destinoPedido: jest.fn()
}));

const { default: PasarelaService } = await import("../pasarela/pasarela.service.js");
const service = new PasarelaService();

function destino(monto = 150) {
  return { tiendaId: "t-1", pedidoId: "p-1", cuotaId: null, monto, email: "c@x.pe", descripcion: "Reserva R-1", alPagar: jest.fn(async () => {}) };
}

beforeEach(() => {
  pagos.clear();
  jest.clearAllMocks();
});

test("cobra el monto del destino y, si se paga, corre alPagar", async () => {
  provider.createCharge.mockResolvedValue({ proveedorCargoId: "chr_1", estado: "pagado", outcomeCode: "aprobado", outcomeMensaje: null });
  const d = destino(150);
  const pago = await service.cobrar({ destino: d, tokenId: "tkn_1", metodo: "tarjeta", proveedor: "simulado" });

  expect(provider.createCharge).toHaveBeenCalledWith(expect.objectContaining({ amount: 150, tokenId: "tkn_1", description: "Reserva R-1" }));
  expect(pago).toMatchObject({ estado: "pagado", monto: 150, proveedor: "simulado", proveedorCargoId: "chr_1" });
  expect(d.alPagar).toHaveBeenCalledTimes(1);
  expect(d.alPagar).toHaveBeenCalledWith(expect.objectContaining({ metodo: "tarjeta", cargoId: "chr_1" }));
});

test("un rechazo responde 422 con el mensaje para el comprador y deja el pago fallido", async () => {
  provider.createCharge.mockRejectedValue(Object.assign(new Error("402"), { code: "fondos_insuficientes", userMessage: "Tu tarjeta no tiene fondos suficientes." }));
  const d = destino();
  const error = await service.cobrar({ destino: d, tokenId: "tkn_1", metodo: "tarjeta", proveedor: "simulado" }).catch(e => e);

  expect(error.statusCode).toBe(422);
  expect(error.message).toBe("Tu tarjeta no tiene fondos suficientes.");
  expect(error.details).toMatchObject({ motivo: "PAGO_RECHAZADO", codigo: "fondos_insuficientes" });
  expect([...pagos.values()][0].estado).toBe("fallido");
  expect(d.alPagar).not.toHaveBeenCalled();
});

test("pendiente no confirma; el webhook confirma una sola vez", async () => {
  provider.createCharge.mockResolvedValue({ proveedorCargoId: "chr_2", estado: "pendiente", outcomeCode: "en_proceso" });
  const d = destino();
  const pago = await service.cobrar({ destino: d, tokenId: "tkn_2", metodo: "tarjeta", proveedor: "simulado" });
  expect(pago.estado).toBe("pendiente");
  expect(d.alPagar).not.toHaveBeenCalled();

  prisma.pagos.findFirst.mockResolvedValueOnce(pagos.get(pago.id));
  provider.getChargeStatus.mockResolvedValue({ estado: "pagado", outcomeCode: "aprobado" });
  destinoWebhook.current = d;
  await service.procesarWebhook({ proveedor: "simulado", body: { id: "evt_1", tipo: "cargo.actualizado", data: { id: "chr_2" } } });
  expect(d.alPagar).toHaveBeenCalledTimes(1);

  // El mismo cargo reconfirmado otra vez (otro evento): ya está pagado, no repite.
  prisma.pagos.findFirst.mockResolvedValueOnce(pagos.get(pago.id));
  await service.procesarWebhook({ proveedor: "simulado", body: { id: "evt_2", tipo: "cargo.actualizado", data: { id: "chr_2" } } });
  expect(d.alPagar).toHaveBeenCalledTimes(1);
});

test("con un cargo en curso no cobra otra vez", async () => {
  prisma.pagos.findFirst.mockResolvedValueOnce({ id: "pago-en-curso" });
  const error = await service.cobrar({ destino: destino(), tokenId: "tkn_3", metodo: "yape", proveedor: "simulado" }).catch(e => e);
  expect(error.details).toMatchObject({ motivo: "PAGO_EN_CURSO" });
  expect(provider.createCharge).not.toHaveBeenCalled();
});

test("sin monto que cobrar no llama a la pasarela", async () => {
  const error = await service.cobrar({ destino: destino(0), tokenId: "tkn_4", metodo: "tarjeta", proveedor: "simulado" }).catch(e => e);
  expect(error.details).toMatchObject({ motivo: "NADA_QUE_PAGAR" });
  expect(provider.createCharge).not.toHaveBeenCalled();
});
