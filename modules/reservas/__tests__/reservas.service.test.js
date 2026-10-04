import { jest } from "@jest/globals";

// Lógica del servicio con la BD simulada: transiciones sobre el estado
// efectivo, conflicto entre dos personas del equipo, montos al verificar el
// pago e idempotencia de la solicitud.
process.env.RESERVAS_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const PEDIDO = "77777777-7777-4777-8777-777777777777";

const prisma = {
  tiendas: { findUnique: jest.fn() },
  pedidos: { findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  reservas: { update: jest.fn() },
  pagos: { update: jest.fn(), create: jest.fn() },
  pedido_historial_estados: { create: jest.fn() },
  metodos_pago: { findMany: jest.fn(async () => []) },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(async (fn) => fn(prisma))
};
const PrismaStub = { PrismaClientKnownRequestError: class extends Error {} };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: PrismaStub, default: prisma }));
jest.unstable_mockModule("../../../services/email.service.js", () => ({
  sendTransactionalEmail: jest.fn(async () => ({ messageId: "m" })), escapeHtml: (s) => String(s ?? "")
}));
jest.unstable_mockModule("../../resenas/resenas.service.js", () => ({ urlTienda: (slug, ruta) => `https://${slug}.test/${ruta}` }));
jest.unstable_mockModule("../../ordenes/pedidos.service.js", () => ({
  generarNumeroPedido: jest.fn(async () => "PED-0012"), upsertCliente: jest.fn(async () => ({ id: "cli" }))
}));
const config = { tipoNegocio: "hotel", cobro: "total", adelantoPct: null, comprobanteEn: "en_el_servicio", instrucciones: null };
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn(async () => config) }));
jest.unstable_mockModule("../cierres.service.js", () => ({ cierresDeProducto: jest.fn(async () => []) }));
jest.unstable_mockModule("../hotel/habitaciones.service.js", () => ({ cargarHabitacionParaReserva: jest.fn() }));
jest.unstable_mockModule("../reservas.capturas.js", () => ({ subirCaptura: jest.fn(), urlCaptura: jest.fn(async () => null) }));

const svc = await import("../reservas.service.js");
const { instanteLima } = await import("../tiempo.js");

const ahora = instanteLima("2026-09-24", "09:43");
const tienda = { id: TIENDA, slug: "verona", nombre: "Verona", email: "hotel@test.com", activo: true, tipoNegocio: "hotel" };

function pedido(extra = {}, reserva = {}) {
  return {
    id: PEDIDO, tiendaId: TIENDA, numeroPedido: "PED-0012", estado: "solicitada",
    subtotal: 100, total: 100, montoPagado: 0, clienteEmail: "c@test.com", clienteWhatsapp: "957625308",
    detalles: [], pagos: [], historialEstados: [],
    reserva: {
      tipo: "hotel", productoId: "p", modalidadId: "m", inicio: instanteLima("2026-09-24", "18:30"),
      fin: instanteLima("2026-09-25", "00:30"), horas: 6, adultos: 1, ninos: 0, montoAPagar: 100, saldoDestino: 0,
      titularNombres: "Diego", titularApellidos: "Luna", titularDocNumero: "44836469", producto: { nombre: "MT", imagenes: [] },
      modalidad: { tipo: "horas", horas: 6 }, ...reserva
    },
    ...extra
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.tiendas.findUnique.mockResolvedValue(tienda);
  prisma.pedidos.updateMany.mockResolvedValue({ count: 1 });
});

describe("aceptarReserva", () => {
  it("acepta una solicitud vigente y fija el monto a pagar", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido());
    await svc.aceptarReserva(TIENDA, PEDIDO, {}, { email: "recepcion@test.com" }, ahora);
    expect(prisma.pedidos.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PEDIDO, tiendaId: TIENDA, estado: "solicitada" },
      data: expect.objectContaining({ estado: "aceptada", total: 100 })
    }));
    expect(prisma.reservas.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ montoAPagar: 100, saldoDestino: 0, ajusteMonto: null })
    }));
  });

  it("una solicitud cuya hora de inicio ya pasó está anulada: 409 sin tocar nada", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido());
    const tarde = instanteLima("2026-09-24", "18:31");
    await expect(svc.aceptarReserva(TIENDA, PEDIDO, {}, null, tarde))
      .rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ motivo: "TRANSICION_INVALIDA", estado: "vencida" }) });
    expect(prisma.pedidos.updateMany).not.toHaveBeenCalled();
  });

  it("si otra persona actuó primero, responde 409 RESERVA_MODIFICADA", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido());
    prisma.pedidos.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.aceptarReserva(TIENDA, PEDIDO, {}, null, ahora))
      .rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ motivo: "RESERVA_MODIFICADA" }) });
  });

  it("el ajuste del total recalcula descuento y monto a pagar", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido());
    await svc.aceptarReserva(TIENDA, PEDIDO, { nuevoTotal: 90, ajusteMotivo: "Cliente frecuente" }, null, ahora);
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ total: 90, descuentoMonto: 10 }));
    expect(prisma.reservas.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ ajusteMonto: -10, montoAPagar: 90 }));
  });
});

describe("verificarPago", () => {
  const conPago = (extra) => pedido({ estado: "pago_en_revision", ...extra }, {});
  const pago = { id: "pg1", proveedor: "manual", estado: "pendiente", monto: 100, metodo: "transferencia", metadata: { capturaPath: "x" }, fechaRegistro: ahora };

  it("confirma, marca el pago y registra lo pagado", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(conPago({ pagos: [pago] }));
    await svc.verificarPago(TIENDA, PEDIDO, { email: "dueno@test.com" }, ahora);
    expect(prisma.pagos.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pg1" }, data: expect.objectContaining({ estado: "pagado" })
    }));
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({
      estado: "confirmada", montoPagado: 100, estadoPago: "pagado"
    }));
  });

  it("un pago a cuenta menor al total deja el pago como parcial", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(conPago({ pagos: [{ ...pago, monto: 30 }] }));
    await svc.verificarPago(TIENDA, PEDIDO, null, ahora);
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ montoPagado: 30, estadoPago: "parcial" }));
  });

  it("sin captura pendiente responde 409", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(conPago({ pagos: [] }));
    await expect(svc.verificarPago(TIENDA, PEDIDO, null, ahora)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("un pago en revisión no vence aunque pase la hora de inicio", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(conPago({ pagos: [pago] }));
    await svc.verificarPago(TIENDA, PEDIDO, null, instanteLima("2026-09-24", "20:00"));
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data.estado).toBe("confirmada");
  });
});

describe("crearSolicitud", () => {
  it("con una clave ya usada devuelve la reserva existente sin crear otra", async () => {
    prisma.pedidos.findFirst
      .mockResolvedValueOnce({ id: PEDIDO })        // búsqueda por idempotencyKey
      .mockResolvedValueOnce(pedido());             // carga de la reserva
    const r = await svc.crearSolicitud({ tiendaId: TIENDA, idempotencyKey: "k" }, { ahora });
    expect(r.nueva).toBe(false);
    expect(r.pedido.id).toBe(PEDIDO);
    expect(r.token.split(".")).toHaveLength(3);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("una tienda que no es hotel no recibe solicitudes", async () => {
    prisma.tiendas.findUnique.mockResolvedValue({ ...tienda, tipoNegocio: "productos" });
    await expect(svc.crearSolicitud({ tiendaId: TIENDA, idempotencyKey: "k" }, { ahora })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("marcarNoShow", () => {
  it("no se puede antes de la hora de ingreso", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido({ estado: "confirmada" }));
    await expect(svc.marcarNoShow(TIENDA, PEDIDO, null, ahora)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("después de la salida, una completada puede marcarse como no presentada", async () => {
    prisma.pedidos.findFirst.mockResolvedValue(pedido({ estado: "confirmada" }));
    await svc.marcarNoShow(TIENDA, PEDIDO, null, instanteLima("2026-09-25", "09:00"));
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data.estado).toBe("no_show");
  });
});
