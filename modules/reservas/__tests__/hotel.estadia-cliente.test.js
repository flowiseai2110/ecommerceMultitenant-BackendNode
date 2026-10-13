import { jest } from "@jest/globals";

// Hotel antes de llegar (docs/specs/plantillas-por-rubro E8): check-in en línea
// y solicitud de cambio de fechas.

const prisma = {
  reservas: { update: jest.fn(async () => ({})) },
  pedido_historial_estados: { create: jest.fn(async () => ({})) },
  tiendas: { findUnique: jest.fn(async () => ({ email: "hotel@x.pe" })) },
  $transaction: jest.fn(async (fn) => fn(prisma))
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));
jest.unstable_mockModule("../../../services/email.service.js", () => ({ escapeHtml: (s) => String(s ?? "") }));
const svc = {
  cotizar: jest.fn(),
  efectivoDe: jest.fn(() => "confirmada"),
  enviar: jest.fn(),
  obtenerSeguimiento: jest.fn(async () => ({ ok: true })),
  pedidoDeReserva: jest.fn()
};
jest.unstable_mockModule("../reservas.service.js", () => svc);

const { registrarCheckin, solicitarCambioFechas } = await import("../hotel/estadia-cliente.js");

const AHORA = new Date("2026-11-01T12:00:00-05:00");
const pedido = (extra = {}) => ({
  id: "p-1", tipo: "hotel", estado: "confirmada", numeroPedido: "R-9", total: 360, clienteEmail: "ana@x.pe",
  reserva: { productoId: "h-1", modalidadId: "m-1", inicio: new Date("2026-11-13T14:00:00-05:00"), adultos: 2, ninos: 0, edadesNinos: [], habitaciones: 1,
    titularNombres: "Ana", titularApellidos: "Quispe" },
  ...extra
});
const persona = (n) => ({ nombres: `P${n}`, apellidos: "X", docTipo: "DNI", docNumero: `1234567${n}` });

beforeEach(() => jest.clearAllMocks());

test("check-in: guarda la llegada y solo los acompañantes que caben en la reserva", async () => {
  svc.pedidoDeReserva.mockResolvedValue(pedido());
  await registrarCheckin("t-1", "p-1", { acompanantes: [persona(1), persona(2)], horaLlegada: "15:30" }, AHORA);
  const { data } = prisma.reservas.update.mock.calls[0][0];
  expect(data.acompanantes).toHaveLength(1); // 2 adultos = titular + 1
  expect(data.checkinOnline).toMatchObject({ horaLlegada: "15:30" });
});

test("con la estadía ya empezada se hace en recepción", async () => {
  svc.pedidoDeReserva.mockResolvedValue(pedido({ reserva: { ...pedido().reserva, inicio: new Date("2026-10-30T14:00:00-05:00") } }));
  await expect(registrarCheckin("t-1", "p-1", { acompanantes: [], horaLlegada: "15:00" }, AHORA)).rejects.toMatchObject({ details: { motivo: "ESTADIA_INICIADA" } });
});

test("solo hospedaje", async () => {
  svc.pedidoDeReserva.mockResolvedValue(pedido({ tipo: "tour" }));
  await expect(solicitarCambioFechas("t-1", "p-1", { fecha: "2026-11-20", noches: 2 }, AHORA)).rejects.toMatchObject({ details: { motivo: "SOLO_HOTEL" } });
});

test("cambio de fechas: cotiza con los mismos huéspedes, guarda la diferencia y avisa al hotel", async () => {
  svc.pedidoDeReserva.mockResolvedValue(pedido());
  svc.cotizar.mockResolvedValue({ total: 420, errores: [] });
  await solicitarCambioFechas("t-1", "p-1", { fecha: "2026-11-20", noches: 2, comentario: "llegamos tarde" }, AHORA);
  expect(svc.cotizar).toHaveBeenCalledWith(expect.objectContaining({ productoId: "h-1", modalidadId: "m-1", fecha: "2026-11-20", noches: 2, adultos: 2 }), AHORA);
  expect(prisma.reservas.update.mock.calls[0][0].data.cambioSolicitado).toMatchObject({ total: 420, diferencia: 60, disponible: true });
  expect(svc.enviar).toHaveBeenCalledWith("hotel@x.pe", expect.objectContaining({ subject: expect.stringContaining("R-9") }), "ana@x.pe");
});

test("sin cupo en las nuevas fechas igual se guarda, con el motivo", async () => {
  svc.pedidoDeReserva.mockResolvedValue(pedido());
  svc.cotizar.mockResolvedValue({ total: 360, errores: [{ codigo: "SIN_CUPO", mensaje: "No hay habitaciones libres" }] });
  await solicitarCambioFechas("t-1", "p-1", { fecha: "2026-11-20", noches: 2 }, AHORA);
  expect(prisma.reservas.update.mock.calls[0][0].data.cambioSolicitado).toMatchObject({ disponible: false, motivo: "No hay habitaciones libres" });
});
