import { jest } from "@jest/globals";

// Salones del local (alquiler-locales R2): precio "desde", publicación y el
// bloqueo de cambios con reservas en curso (R2.7, CE-05).

const TIENDA = "22222222-2222-4222-8222-222222222222";
const SALON = "33333333-3333-4333-8333-333333333333";

const prisma = {
  productos: { findFirst: jest.fn(async () => ({ id: SALON, nombre: "Imperial" })), update: jest.fn() },
  local_turnos: { findMany: jest.fn(async () => []), deleteMany: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn(async () => ({ id: "t-nuevo" })) },
  local_paquetes: { deleteMany: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn() },
  local_salones: {
    upsert: jest.fn(), findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => ({ porHoras: false, turnos: [], paquetes: [] }))
  },
  pedidos: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (fn) => fn(prisma))
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: { DbNull: "DbNull" }, default: prisma }));
jest.unstable_mockModule("../../catalogo/productos.cache.js", () => ({ invalidateProductoDetailCache: jest.fn() }));
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn(async () => ({ horaTope: "03:00" })) }));

const { guardarFichaSalon, precioDesde, publicable } = await import("../locales/salones.service.js");
const { instanteLima } = await import("../tiempo.js");

const noche = { id: "t-noche", nombre: "Noche", horaInicio: "19:00", horaFin: "03:00", diasSemana: [5, 6], precios: { lj: 1800, s: 2700 }, activo: true };
const data = {
  metros: 400, aforoMaximo: 200, preparacionMin: 60, porHoras: false, precioHora: null, minHoras: null, horasDesde: null, horasHasta: null,
  servicios: ["mesas"], turnos: [noche],
  paquetes: [{ nombre: "Solo local", modalidad: "solo_local", precioTipo: "fijo", precios: null, incluye: [], tiposEvento: [], turnoIds: ["t-noche"], turnoRefs: [], activo: true }]
};
const ahora = instanteLima("2026-10-09", "10:00");

beforeEach(() => jest.clearAllMocks());

describe("precio desde y publicación", () => {
  test("el menor precio de un evento completo", () => {
    const paquetes = [
      { modalidad: "solo_local", activo: true, turnoIds: [] },
      { modalidad: "paquete", precioTipo: "por_persona", precios: { lj: 60 }, minPersonas: 100, activo: true }
    ];
    expect(precioDesde({ porHoras: false }, [noche], paquetes)).toBe(1800);
    expect(precioDesde({ porHoras: true, precioHora: 250, minHoras: 3 }, [], [{ modalidad: "por_horas", activo: true }])).toBe(750);
  });

  test("sin turnos activos un paquete por turno no publica el salón", () => {
    expect(publicable({ porHoras: false }, [{ ...noche, activo: false }], [{ modalidad: "solo_local", activo: true }])).toBe(false);
    expect(publicable({ porHoras: false }, [noche], [{ modalidad: "solo_local", activo: true }])).toBe(true);
  });
});

describe("guardarFichaSalon (R2.7)", () => {
  const reserva = (invitados, turnoId = "t-noche") => ({
    id: "ped-1", numeroPedido: "PED-0001", clienteNombre: "Rosa", estado: "confirmada",
    reserva: { inicio: instanteLima("2026-12-05", "19:00"), turnoId, invitados }
  });

  test("bajar el aforo debajo de una reserva en curso responde 409 con la lista", async () => {
    prisma.pedidos.findMany.mockResolvedValueOnce([reserva(180)]);
    await expect(guardarFichaSalon(TIENDA, SALON, { ...data, aforoMaximo: 150 }, null, ahora)).rejects.toMatchObject({
      statusCode: 409,
      details: { motivo: "CAMBIO_CON_RESERVAS", reservas: [expect.objectContaining({ codigo: "PED-0001", fecha: "2026-12-05", motivo: "180 invitados" })] }
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("desactivar un turno con reservas en curso responde 409", async () => {
    prisma.local_turnos.findMany.mockResolvedValueOnce([{ id: "t-noche", activo: true }]);
    prisma.pedidos.findMany.mockResolvedValueOnce([reserva(100)]);
    await expect(guardarFichaSalon(TIENDA, SALON, { ...data, turnos: [{ ...noche, activo: false }] }, null, ahora))
      .rejects.toMatchObject({ details: { motivo: "CAMBIO_CON_RESERVAS" } });
  });

  test("un turno que pasa la hora tope no se guarda", async () => {
    await expect(guardarFichaSalon(TIENDA, SALON, { ...data, turnos: [{ ...noche, horaFin: "04:00" }] }, null, ahora))
      .rejects.toMatchObject({ details: { motivo: "HORA_TOPE_EXCEDIDA" } });
  });

  test("sin conflictos guarda en una transacción y un paquete apunta al turno nuevo por su posición", async () => {
    const turnoNuevo = { ...noche, id: undefined };
    await guardarFichaSalon(TIENDA, SALON, { ...data, turnos: [turnoNuevo], paquetes: [{ ...data.paquetes[0], turnoIds: [], turnoRefs: [0] }] }, null, ahora);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.local_paquetes.create).toHaveBeenCalledWith({ data: expect.objectContaining({ turnoIds: ["t-nuevo"], productoId: SALON, tiendaId: TIENDA }) });
    expect(prisma.productos.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ esServicio: true }) }));
  });
});
