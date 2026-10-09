import { jest } from "@jest/globals";

// Flujo de una reserva de local con la BD simulada (alquiler-locales L1.15):
// la solicitud ocupa la franja, el 23P01 se traduce a 409 con alternativas,
// aceptar genera plan y contrato, la primera cuota verificada confirma y las
// acciones repetidas del admin no duplican nada.
process.env.RESERVAS_LINK_SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";

const TIENDA = "22222222-2222-4222-8222-222222222222";
const SALON = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "77777777-7777-4777-8777-777777777777";
const instanteLimaTest = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`);

const tienda = { id: TIENDA, slug: "imperial", nombre: "Salones Imperial", email: "local@test.com", activo: true, tipoNegocio: "locales", ruc: "20123456789", direccion: "Av. Perú 123" };
let pedidoActual = null;

const prisma = {
  tiendas: { findUnique: jest.fn(async () => tienda) },
  pedidos: {
    findFirst: jest.fn(async ({ where }) => (where.idempotencyKey ? null : pedidoActual)),
    findUnique: jest.fn(async () => pedidoActual),
    create: jest.fn(async () => ({ id: PEDIDO })),
    count: jest.fn(async () => 0),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({}))
  },
  pedido_historial_estados: { create: jest.fn() },
  reservas: { update: jest.fn() },
  reserva_cuotas: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  reserva_cambios: { create: jest.fn() },
  local_ocupaciones: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 1 })) },
  local_cotizaciones: { updateMany: jest.fn(async () => ({ count: 1 })) },
  pagos: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  metodos_pago: { findMany: jest.fn(async () => []) },
  $executeRaw: jest.fn(async () => 0),
  $queryRaw: jest.fn(async () => [{ id: "ocu-1" }]),
  $transaction: jest.fn(async (fn) => fn(prisma))
};
class KnownError extends Error { constructor(code) { super(code); this.code = code; } }
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: { PrismaClientKnownRequestError: KnownError, DbNull: "DbNull" }, default: prisma }));
jest.unstable_mockModule("../../../services/email.service.js", () => ({
  sendTransactionalEmail: jest.fn(async () => ({ messageId: "m" })), escapeHtml: (s) => String(s ?? "")
}));
jest.unstable_mockModule("../../resenas/resenas.service.js", () => ({ urlTienda: (slug, ruta) => `https://${slug}.test/${ruta}` }));
jest.unstable_mockModule("../../ordenes/pedidos.service.js", () => ({
  generarNumeroPedido: jest.fn(async () => "PED-0001"), upsertCliente: jest.fn(async () => ({ id: "cli" }))
}));
jest.unstable_mockModule("../reservas.capturas.js", () => ({ subirCaptura: jest.fn(async () => "path/captura.jpg"), urlCaptura: jest.fn(async () => null) }));
jest.unstable_mockModule("../cierres.service.js", () => ({ cierresDeProducto: jest.fn(async () => []) }));
jest.unstable_mockModule("../hotel/tarifas.service.js", () => ({ temporadasParaEstadia: jest.fn(async () => []), extrasDeTienda: jest.fn(async () => []), planDeTienda: jest.fn(async () => null) }));

const { resolverConfig } = await import("../reservas.config.service.js");
const config = { ...resolverConfig("locales", null), garantiaMonto: 500 };
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn(async () => config) }));

const noche = { id: "t-noche", nombre: "Noche", horaInicio: "19:00", horaFin: "03:00", diasSemana: [5, 6], precios: { lj: 1800, s: 2700 }, activo: true, orden: 0 };
const soloLocal = { id: "p-solo", nombre: "Solo local", modalidad: "solo_local", precioTipo: "fijo", activo: true, turnoIds: [], tiposEvento: [], incluye: [] };
jest.unstable_mockModule("../locales/salones.service.js", () => ({
  cargarSalonParaReserva: jest.fn(async () => ({
    producto: { id: SALON, nombre: "Imperial" },
    salon: { productoId: SALON, nombre: "Imperial", aforoMaximo: 200, preparacionMin: 60, porHoras: false },
    turnos: [noche], paquetes: [soloLocal]
  }))
}));

const svc = await import("../reservas.service.js");
const cuotasSvc = await import("../locales/cuotas.service.js");
const { instanteLima } = await import("../tiempo.js");

const ahora = instanteLima("2026-10-09", "10:00");

const solicitud = (extra = {}) => ({
  tiendaId: TIENDA, productoId: SALON, paqueteId: "p-solo", turnoId: "t-noche", fecha: "2026-12-05", invitados: 150, tipoEvento: "quinceanos",
  agasajado: "Camila", proveedoresExternos: false, horas: null, hora: null, cotizacionToken: null,
  titular: { nombres: "Rosa", apellidos: "Quispe", docTipo: "DNI", docNumero: "44836469", nacionalidad: "PE" },
  whatsapp: "957625308", email: "rosa@test.com", acompanantes: [], comentarios: null, aceptaDatos: true,
  idempotencyKey: "99999999-9999-4999-8999-999999999999", ...extra
});

function pedidoLocal(estado, { cuotas = [], contrato = null, pagos = [], apartadoHasta = null } = {}) {
  return {
    id: PEDIDO, tiendaId: TIENDA, numeroPedido: "PED-0001", tipo: "local", estado, subtotal: 2700, total: 2700, montoPagado: 0,
    clienteEmail: "rosa@test.com", clienteWhatsapp: "957625308", detalles: [], pagos, historialEstados: [], cuotas, cambios: [],
    reserva: {
      tipo: "local", productoId: SALON, inicio: instanteLima("2026-12-05", "19:00"), fin: instanteLima("2026-12-06", "03:00"), apartadoHasta,
      invitados: 150, tipoEvento: "quinceanos", agasajado: "Camila", contrato, horas: null, montoAPagar: 1080, saldoDestino: 0,
      titularNombres: "Rosa", titularApellidos: "Quispe", titularDocTipo: "DNI", titularDocNumero: "44836469", titularNacionalidad: "PE",
      local: { salon: { nombre: "Imperial", aforoMaximo: 200, preparacionMin: 60 }, turno: { nombre: "Noche" }, paquete: { nombre: "Solo local", incluye: [] }, garantia: 500, fecha: "2026-12-05", horaInicio: "19:00", horaFin: "03:00" },
      producto: { nombre: "Imperial", imagenes: [] }
    }
  };
}

const cuota = (numero, concepto, monto, estado = "pendiente", venceEn = "2026-11-05") =>
  ({ id: `cuota-${numero}`, numero, concepto, monto, estado, venceEn: new Date(`${venceEn}T00:00:00Z`) });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$queryRaw.mockImplementation(async () => [{ id: "ocu-1" }]);
});

describe("crearSolicitud de local", () => {
  test("ocupa la franja con preparación y la aparta por el plazo de respuesta (R6.2)", async () => {
    pedidoActual = pedidoLocal("solicitada");
    await svc.crearSolicitud(solicitud(), { ahora });
    const reserva = prisma.pedidos.create.mock.calls[0][0].data.reserva.create;
    expect(reserva).toMatchObject({ tipo: "local", invitados: 150, tipoEvento: "quinceanos", turnoId: "t-noche", paqueteId: "p-solo", agasajado: "Camila" });
    expect(reserva.apartadoHasta).toEqual(instanteLima("2026-10-10", "10:00")); // 24 h
    expect(reserva.local.turno.nombre).toBe("Noche");
    expect(prisma.pedidos.create.mock.calls[0][0].data).toMatchObject({ tipo: "local", estado: "solicitada", total: 2700 });
    // INSERT de la ocupación: [inicio − 60 min, fin + 60 min).
    const valores = prisma.$queryRaw.mock.calls[0].slice(1);
    expect(valores).toEqual(expect.arrayContaining(["solicitud", instanteLimaTest("2026-12-05", "18:00"), instanteLimaTest("2026-12-06", "04:00")]));
  });

  test("dos clientes a la vez: el segundo recibe 409 FECHA_NO_DISPONIBLE con alternativas (CE-01)", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(Object.assign(new Error('violates exclusion constraint "ex_local_ocupacion"'), { code: "23P01" }));
    prisma.local_ocupaciones.findMany.mockResolvedValueOnce([{ inicio: instanteLima("2026-12-05", "18:00"), fin: instanteLima("2026-12-06", "04:00") }]);
    await expect(svc.crearSolicitud(solicitud(), { ahora })).rejects.toMatchObject({
      statusCode: 409,
      details: { motivo: "FECHA_NO_DISPONIBLE", alternativas: [expect.objectContaining({ fecha: "2026-12-04", turno: "Noche" }), expect.anything(), expect.anything()] }
    });
  });

  test("aforo de la licencia: 422 antes de tocar la BD (CE-08)", async () => {
    await expect(svc.crearSolicitud(solicitud({ invitados: 250 }), { ahora })).rejects.toMatchObject({ details: { motivo: "RESERVA_NO_VALIDA" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("aceptar (R6.5)", () => {
  test("genera plan, contrato con hash y pasa la ocupación a apartado por 48 h", async () => {
    pedidoActual = pedidoLocal("solicitada", { apartadoHasta: instanteLima("2026-10-10", "10:00") });
    await svc.aceptarReserva(TIENDA, PEDIDO, { nuevoTotal: null, ajusteMotivo: null }, { email: "dueno@test.com" }, ahora);
    const cuotas = prisma.reserva_cuotas.createMany.mock.calls[0][0].data;
    expect(cuotas.map(c => c.concepto)).toEqual(["separacion", "cuota", "cuota", "saldo", "garantia"]);
    expect(cuotas[0].monto).toBe(1080);
    const data = prisma.reservas.update.mock.calls[0][0].data;
    expect(data.apartadoHasta).toEqual(instanteLima("2026-10-11", "10:00"));
    expect(data.contrato).toMatchObject({ version: 1, aceptadoEn: null });
    expect(data.contrato.hash).toHaveLength(64);
    expect(data.contrato.texto).toContain("Rosa Quispe (DNI 44836469)");
    expect(prisma.local_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { tipo: "apartado", expiraEn: data.apartadoHasta } });
  });

  test("una solicitud vencida no se acepta (CT-02)", async () => {
    pedidoActual = pedidoLocal("solicitada", { apartadoHasta: instanteLima("2026-10-09", "09:00") });
    await expect(svc.aceptarReserva(TIENDA, PEDIDO, { nuevoTotal: null }, null, ahora)).rejects.toMatchObject({ details: { motivo: "TRANSICION_INVALIDA" } });
  });

  test("rechazar libera la franja en la misma transacción", async () => {
    pedidoActual = pedidoLocal("solicitada", { apartadoHasta: instanteLima("2026-10-10", "10:00") });
    await svc.rechazarReserva(TIENDA, PEDIDO, { motivoTipo: "sin_disponibilidad", motivo: null }, null, ahora);
    expect(prisma.local_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { activo: false } });
  });

  test("el pago de un solo monto no aplica a locales", async () => {
    pedidoActual = pedidoLocal("pago_en_revision");
    await expect(svc.verificarPago(TIENDA, PEDIDO, null, ahora)).rejects.toMatchObject({ details: { motivo: "USAR_CUOTAS" } });
  });
});

describe("cuotas (R7, R8)", () => {
  const contrato = { version: 1, hash: "a".repeat(64), texto: "…", aceptadoEn: null };
  const plan = (primera = "pendiente") => [cuota(1, "separacion", 1080, primera, "2026-10-11"), cuota(2, "saldo", 1620), cuota(3, "garantia", 500)];

  test("no se paga sin aceptar el contrato; aceptar exige el hash leído", async () => {
    pedidoActual = pedidoLocal("aceptada", { cuotas: plan(), contrato, apartadoHasta: instanteLima("2026-10-11", "10:00") });
    await expect(cuotasSvc.subirCapturaCuota(TIENDA, PEDIDO, "cuota-1", { metodo: "yape", numeroOperacion: "123" }, ahora))
      .rejects.toMatchObject({ details: { motivo: "CONTRATO_NO_ACEPTADO" } });
    await expect(cuotasSvc.aceptarContrato(TIENDA, PEDIDO, { version: 1, hash: "b".repeat(64) }, {}, ahora))
      .rejects.toMatchObject({ details: { motivo: "CONTRATO_DESACTUALIZADO" } });
    await cuotasSvc.aceptarContrato(TIENDA, PEDIDO, { version: 1, hash: "a".repeat(64) }, { ip: "1.2.3.4" }, ahora);
    expect(prisma.reservas.update.mock.calls[0][0].data.contrato).toMatchObject({ ip: "1.2.3.4", aceptadoPor: { docNumero: "44836469" } });
  });

  test("antes de confirmar solo se paga la separación; con número de operación basta (R14.6)", async () => {
    pedidoActual = pedidoLocal("aceptada", { cuotas: plan(), contrato: { ...contrato, aceptadoEn: "x" }, apartadoHasta: instanteLima("2026-10-11", "10:00") });
    await expect(cuotasSvc.subirCapturaCuota(TIENDA, PEDIDO, "cuota-2", { metodo: "yape", numeroOperacion: "1" }, ahora))
      .rejects.toMatchObject({ details: { motivo: "PRIMERO_SEPARACION" } });
    await cuotasSvc.subirCapturaCuota(TIENDA, PEDIDO, "cuota-1", { metodo: "yape", numeroOperacion: "123" }, ahora);
    expect(prisma.pagos.create.mock.calls[0][0].data).toMatchObject({ cuotaId: "cuota-1", monto: 1080, metadata: { capturaPath: null, numeroOperacion: "123" } });
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data.estado).toBe("pago_en_revision");
    // La fecha deja de vencer mientras el negocio revisa.
    expect(prisma.local_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { expiraEn: null } });
  });

  test("la primera cuota verificada confirma y bloquea la fecha; monto pagado sin garantía (R7.4, R7.8)", async () => {
    const pago = { id: "pago-1", cuotaId: "cuota-1", proveedor: "manual", estado: "pendiente", metodo: "yape", metadata: {} };
    pedidoActual = pedidoLocal("pago_en_revision", { cuotas: plan("en_revision"), contrato: { ...contrato, aceptadoEn: "x" }, pagos: [pago] });
    await cuotasSvc.verificarCuota(TIENDA, PEDIDO, "cuota-1", { email: "r@test.com" }, ahora);
    const cambio = prisma.pedidos.updateMany.mock.calls[0][0].data;
    expect(cambio).toMatchObject({ estado: "confirmada", montoPagado: 1080, estadoPago: "parcial" });
    expect(prisma.local_ocupaciones.updateMany).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO, activo: true }, data: { tipo: "reserva", expiraEn: null } });
  });

  test("una cuota siguiente no cambia el estado; repetir la verificación no duplica (CE-17)", async () => {
    const pago = { id: "pago-2", cuotaId: "cuota-3", proveedor: "manual", estado: "pendiente", metodo: "plin", metadata: {} };
    const cuotas = [cuota(1, "separacion", 1080, "pagada"), cuota(2, "saldo", 1620, "pagada"), cuota(3, "garantia", 500, "en_revision")];
    pedidoActual = pedidoLocal("confirmada", { cuotas, contrato: { ...contrato, aceptadoEn: "x" }, pagos: [pago] });
    await cuotasSvc.verificarCuota(TIENDA, PEDIDO, "cuota-3", null, ahora);
    expect(prisma.pedidos.updateMany).not.toHaveBeenCalled();
    // La garantía no suma al monto pagado; con el total cubierto queda "pagado".
    expect(prisma.pedidos.update.mock.calls[0][0].data).toMatchObject({ montoPagado: 2700, estadoPago: "pagado" });

    jest.clearAllMocks();
    pedidoActual = pedidoLocal("confirmada", { cuotas: cuotas.map(c => ({ ...c, estado: "pagada" })), contrato });
    await cuotasSvc.verificarCuota(TIENDA, PEDIDO, "cuota-3", null, ahora);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("rechazar la captura de la separación vuelve a aceptada con apartado nuevo (CT-04)", async () => {
    const pago = { id: "pago-1", cuotaId: "cuota-1", proveedor: "manual", estado: "pendiente", metodo: "yape", metadata: {} };
    pedidoActual = pedidoLocal("pago_en_revision", { cuotas: plan("en_revision"), contrato, pagos: [pago] });
    await cuotasSvc.rechazarCuota(TIENDA, PEDIDO, "cuota-1", { motivo: "Monto distinto" }, null, ahora);
    expect(prisma.pedidos.updateMany.mock.calls[0][0].data.estado).toBe("aceptada");
    expect(prisma.reservas.update).toHaveBeenCalledWith({ where: { pedidoId: PEDIDO }, data: { apartadoHasta: instanteLima("2026-10-11", "10:00") } });
  });

  test("el plan se bloquea con el primer pago (PLAN_BLOQUEADO)", async () => {
    pedidoActual = pedidoLocal("confirmada", { cuotas: plan("pagada"), contrato });
    await expect(cuotasSvc.editarPlan(TIENDA, PEDIDO, { cuotas: [] }, null, ahora)).rejects.toMatchObject({ details: { motivo: "PLAN_BLOQUEADO" } });
  });

  test("seguimiento: resumen del plan y contrato para leer", async () => {
    pedidoActual = pedidoLocal("aceptada", { cuotas: plan(), contrato: { ...contrato, texto: "CONTRATO…" }, apartadoHasta: instanteLima("2026-10-11", "10:00") });
    const dto = await svc.obtenerSeguimiento(TIENDA, PEDIDO, ahora);
    expect(dto.local).toMatchObject({ salon: "Imperial", invitados: 150, tipoEventoEtiqueta: "Quinceaños" });
    expect(dto.local.resumen).toMatchObject({ total: 2700, pagado: 0, saldo: 2700, garantia: 500, enMora: false });
    expect(dto.local.plan[0]).toMatchObject({ concepto: "separacion", venceEn: "2026-10-11" });
    expect(dto.local.contrato.texto).toBe("CONTRATO…");
    // Sin contrato aceptado no se muestran los datos de pago.
    expect(dto.pago.metodos).toEqual([]);
  });
});
