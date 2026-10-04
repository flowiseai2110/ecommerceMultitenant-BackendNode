import { jest } from "@jest/globals";

// Prisma simulado: $transaction ejecuta el callback con el mismo mock como `tx`
// (o resuelve el array de operaciones).
const db = {
  tiendas: { findUnique: jest.fn() },
  pedidos: { findFirst: jest.fn() },
  libro_reclamaciones: {
    create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn()
  },
  libro_reclamaciones_eventos: { create: jest.fn() },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn()
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: db, Prisma: {}, default: db }));
const config = {
  frontendUrl: "https://admin.test",
  platform: { baseDomain: "ecompyme.com", storefrontUrl: "http://localhost:4200/" },
  libro: { linkSecret: "secreto-de-prueba-de-al-menos-32-bytes!!", linkTtlDias: 1095, ipSalt: "sal" },
  resend: {}
};
jest.unstable_mockModule("../../../config/index.js", () => ({ default: config, config }));
jest.unstable_mockModule("../../../config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
const sendTransactionalEmail = jest.fn();
jest.unstable_mockModule("../../../services/email.service.js", () => ({
  sendTransactionalEmail,
  escapeHtml: (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}));
// resenas.service solo aporta urlTienda; se evita cargar su cadena de imports.
jest.unstable_mockModule("../../resenas/resenas.service.js", () => ({
  urlTienda: (slug, ruta) => `https://${slug}.ecompyme.com/${ruta}`
}));

const service = await import("../libro.service.js");
const { ConflictError, NotFoundError, ValidationError } = await import("../../../utils/errors.js");

const TIENDA = "22222222-2222-4222-8222-222222222222";
const HOJA = "77777777-7777-4777-8777-777777777777";

const tienda = (extra = {}) => ({
  id: TIENDA, slug: "zapateria", nombre: "Zapatería Alonso", email: "tienda@test.com", moneda: "PEN", activo: true,
  ruc: "20100047218", razonSocial: "ZAPATERIA ALONSO SAC", direccionFiscal: "Av. Lima 123", direccion: null, ...extra
});

const datos = (extra = {}) => ({
  tiendaId: TIENDA, tipo: "reclamo",
  consumidorNombres: "Ana", consumidorApellidos: "Pérez", consumidorDocTipo: "DNI", consumidorDocNumero: "12345678",
  consumidorDomicilio: "Jr. Puno 456, Lima", consumidorTelefono: null, consumidorEmail: "ana@test.com",
  esMenor: false, apoderadoNombre: null, apoderadoDocTipo: null, apoderadoDocNumero: null,
  bienTipo: "producto", bienDescripcion: "Zapatillas talla 38", montoReclamado: 150, pedidoId: null, numeroPedidoTexto: null,
  detalle: "Llegaron con la suela despegada y no responden mis mensajes.", pedidoConsumidor: "Cambio por un par nuevo",
  medioRespuesta: "email", aceptaDeclaracion: true, ...extra
});

// Fila de BD tal como la devuelve Prisma.
const fila = (extra = {}) => ({
  id: HOJA, tiendaId: TIENDA, anio: 2026, correlativo: 1, numero: "00001-2026", tipo: "reclamo", estado: "pendiente",
  fechaLimite: new Date("2026-10-27T00:00:00Z"),
  proveedorNombre: "Zapatería Alonso", proveedorRazonSocial: "ZAPATERIA ALONSO SAC", proveedorRuc: "20100047218",
  proveedorDireccion: "Av. Lima 123",
  consumidorNombres: "Ana", consumidorApellidos: "Pérez", consumidorDocTipo: "DNI", consumidorDocNumero: "12345678",
  consumidorDomicilio: "Jr. Puno 456", consumidorTelefono: null, consumidorEmail: "ana@test.com",
  esMenor: false, apoderadoNombre: null, apoderadoDocTipo: null, apoderadoDocNumero: null,
  bienTipo: "producto", bienDescripcion: "Zapatillas", montoReclamado: "150.00", moneda: "PEN",
  pedidoId: null, numeroPedidoTexto: null, detalle: "Detalle", pedidoConsumidor: "Pedido", medioRespuesta: "email",
  aceptaDeclaracion: true, authUserId: null, ipHash: null,
  respuesta: null, accionAdoptada: null, fechaRespuesta: null, respondidoPor: null,
  fechaRegistro: new Date("2026-10-05T15:00:00Z"), fechaActualizacion: null, ...extra
});

beforeEach(() => {
  for (const modelo of Object.values(db)) {
    if (typeof modelo === "function") { modelo.mockReset(); continue; }
    for (const fn of Object.values(modelo)) fn.mockReset();
  }
  db.$transaction.mockImplementation((arg) => (typeof arg === "function" ? arg(db) : Promise.all(arg)));
  db.libro_reclamaciones.create.mockImplementation(async ({ data }) => ({ id: HOJA, ...data }));
  sendTransactionalEmail.mockReset();
});

describe("normalizarNumeroPedido", () => {
  it("lleva variantes al formato PED-0000", () => {
    expect(service.normalizarNumeroPedido("12")).toBe("PED-0012");
    expect(service.normalizarNumeroPedido(" ped-12 ")).toBe("PED-0012");
    expect(service.normalizarNumeroPedido("PED0012")).toBe("PED-0012");
    expect(service.normalizarNumeroPedido("ABC")).toBe("ABC");
  });
});

describe("hashIp", () => {
  it("no guarda nada sin sal y es estable con sal", () => {
    expect(service.hashIp("1.2.3.4", null)).toBeNull();
    expect(service.hashIp("1.2.3.4", "s")).toHaveLength(64);
    expect(service.hashIp("1.2.3.4", "s")).toBe(service.hashIp("1.2.3.4", "s"));
  });
});

describe("registrarHoja", () => {
  const now = new Date("2026-10-05T15:00:00Z"); // lunes, 10:00 en Lima

  it("asigna correlativo por tienda y año, fecha límite y snapshot del proveedor (R3.1–R3.3)", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda());
    db.$queryRaw.mockResolvedValue([{ max: 41 }]);

    const { hoja } = await service.registrarHoja(datos(), { ip: "1.2.3.4", now });

    expect(db.$executeRaw).toHaveBeenCalled(); // advisory lock
    expect(hoja).toEqual(expect.objectContaining({
      anio: 2026, correlativo: 42, numero: "00042-2026",
      proveedorRazonSocial: "ZAPATERIA ALONSO SAC", proveedorRuc: "20100047218", proveedorDireccion: "Av. Lima 123",
      moneda: "PEN", fechaRegistro: now, aceptaDeclaracion: true
    }));
    expect(hoja.fechaLimite.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect(hoja.ipHash).toHaveLength(64);
    expect(hoja.eventos).toEqual({ create: { tipo: "registrada", usuario: "consumidor" } });
  });

  it("la primera hoja del año es 00001", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda());
    db.$queryRaw.mockResolvedValue([{ max: null }]);
    const { hoja } = await service.registrarHoja(datos(), { now });
    expect(hoja.numero).toBe("00001-2026");
  });

  it("tienda inexistente o inactiva → 404 (R3.6)", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda({ activo: false }));
    await expect(service.registrarHoja(datos(), { now })).rejects.toBeInstanceOf(NotFoundError);
    expect(db.libro_reclamaciones.create).not.toHaveBeenCalled();
  });

  it("acepta la hoja aunque la tienda no tenga datos legales (R1.4)", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda({ ruc: null, razonSocial: null, direccionFiscal: null }));
    db.$queryRaw.mockResolvedValue([{ max: 0 }]);
    const { hoja } = await service.registrarHoja(datos(), { now });
    expect(hoja.proveedorRuc).toBeNull();
    expect(hoja.proveedorNombre).toBe("Zapatería Alonso");
  });

  it("con sesión solo enlaza un pedido de su cuenta", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda());
    db.$queryRaw.mockResolvedValue([{ max: 0 }]);
    db.pedidos.findFirst.mockResolvedValue({ id: "ped-1", numeroPedido: "PED-0007" });

    const { hoja } = await service.registrarHoja(datos({ pedidoId: "ped-1" }), { authUserId: "user-1", now });

    expect(db.pedidos.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ped-1", tiendaId: TIENDA, authUserId: "user-1" }
    }));
    expect(hoja.pedidoId).toBe("ped-1");
    expect(hoja.numeroPedidoTexto).toBe("PED-0007");
  });

  it("sin sesión ignora el pedidoId y enlaza por el número escrito, en silencio", async () => {
    db.tiendas.findUnique.mockResolvedValue(tienda());
    db.$queryRaw.mockResolvedValue([{ max: 0 }]);
    db.pedidos.findFirst.mockResolvedValue(null);

    const { hoja } = await service.registrarHoja(datos({ pedidoId: "ped-x", numeroPedidoTexto: "12" }), { now });

    expect(db.pedidos.findFirst).toHaveBeenCalledTimes(1);
    expect(db.pedidos.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tiendaId: TIENDA, numeroPedido: "PED-0012" }
    }));
    expect(hoja.pedidoId).toBeNull();
    expect(hoja.numeroPedidoTexto).toBe("12");
  });
});

describe("notificarRegistro", () => {
  it("manda constancia y aviso y registra ambos eventos; un fallo no lanza (R4.4)", async () => {
    sendTransactionalEmail
      .mockResolvedValueOnce({ messageId: "m-1" })
      .mockRejectedValueOnce(new Error("Resend caído"));

    await expect(service.notificarRegistro(fila(), tienda(), "token-123")).resolves.toBeUndefined();

    expect(sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "ana@test.com", replyTo: "tienda@test.com"
    }));
    const html = sendTransactionalEmail.mock.calls[0][0].html;
    expect(html).toContain("00001-2026");
    expect(html).toContain("https://zapateria.ecompyme.com/libro-reclamaciones/hoja/token-123");
    const tipos = db.libro_reclamaciones_eventos.create.mock.calls.map(c => c[0].data.tipo);
    expect(tipos).toEqual(["constancia_enviada", "aviso_tienda_fallo"]);
  });

  it("escapa el HTML que escribió el consumidor", async () => {
    sendTransactionalEmail.mockResolvedValue({ messageId: "m" });
    await service.notificarRegistro(fila({ detalle: "<script>x</script>" }), tienda(), "t");
    expect(sendTransactionalEmail.mock.calls[0][0].html).not.toContain("<script>");
  });
});

describe("responderHoja (R6.5–R6.7)", () => {
  const user = { id: "u-1", email: "dueno@test.com" };
  const cuerpo = { respuesta: "Le enviaremos un par nuevo esta semana sin costo.", accionAdoptada: "Cambio de producto" };

  beforeEach(() => {
    db.tiendas.findUnique.mockResolvedValue({ slug: "zapateria", email: "tienda@test.com" });
  });

  it("por correo: actualiza, envía y registra el evento con el messageId", async () => {
    db.libro_reclamaciones.findFirst
      .mockResolvedValueOnce(fila())
      .mockResolvedValueOnce(fila({ estado: "respondida", respuesta: cuerpo.respuesta, fechaRespuesta: new Date(), eventos: [] }));
    db.libro_reclamaciones.updateMany.mockResolvedValue({ count: 1 });
    sendTransactionalEmail.mockResolvedValue({ messageId: "m-9" });

    const r = await service.responderHoja(TIENDA, HOJA, cuerpo, user);

    expect(db.libro_reclamaciones.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: HOJA, tiendaId: TIENDA, estado: { in: ["pendiente", "en_atencion"] } }
    }));
    expect(sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@test.com" }));
    expect(db.libro_reclamaciones_eventos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "respondida", detalle: { medio: "email", messageId: "m-9" } })
    });
    expect(r.estado).toBe("respondida");
  });

  it("si Resend falla, lanza 502 y deja un evento de fallo (la transacción hace rollback)", async () => {
    db.libro_reclamaciones.findFirst.mockResolvedValue(fila());
    db.libro_reclamaciones.updateMany.mockResolvedValue({ count: 1 });
    sendTransactionalEmail.mockRejectedValue(new Error("dominio no verificado"));

    await expect(service.responderHoja(TIENDA, HOJA, cuerpo, user)).rejects.toMatchObject({
      statusCode: 502, code: "EMAIL_NO_ENVIADO"
    });
    const tipos = db.libro_reclamaciones_eventos.create.mock.calls.map(c => c[0].data.tipo);
    expect(tipos).toEqual(["respuesta_fallo"]);
  });

  it("ya respondida → 409 sin enviar correo", async () => {
    db.libro_reclamaciones.findFirst.mockResolvedValue(fila({ estado: "respondida" }));
    await expect(service.responderHoja(TIENDA, HOJA, cuerpo, user)).rejects.toBeInstanceOf(ConflictError);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("carrera: si el UPDATE no toca filas → 409 sin enviar correo", async () => {
    db.libro_reclamaciones.findFirst.mockResolvedValue(fila());
    db.libro_reclamaciones.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.responderHoja(TIENDA, HOJA, cuerpo, user)).rejects.toBeInstanceOf(ConflictError);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("domicilio: exige la fecha de entrega de la carta y no envía correo", async () => {
    db.libro_reclamaciones.findFirst.mockResolvedValue(fila({ medioRespuesta: "domicilio" }));
    await expect(service.responderHoja(TIENDA, HOJA, cuerpo, user)).rejects.toBeInstanceOf(ValidationError);

    db.libro_reclamaciones.findFirst
      .mockResolvedValueOnce(fila({ medioRespuesta: "domicilio", fechaRegistro: new Date("2026-10-01T15:00:00Z") }))
      .mockResolvedValueOnce(fila({ medioRespuesta: "domicilio", estado: "respondida", eventos: [] }));
    db.libro_reclamaciones.updateMany.mockResolvedValue({ count: 1 });
    await service.responderHoja(TIENDA, HOJA, { ...cuerpo, fechaEntregaCarta: "2026-10-02" }, user);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(db.libro_reclamaciones.updateMany.mock.calls[0][0].data.fechaRespuesta.toISOString())
      .toBe("2026-10-02T17:00:00.000Z");
  });

  it("domicilio: rechaza una fecha de carta anterior al registro o futura", async () => {
    db.libro_reclamaciones.findFirst.mockResolvedValue(fila({ medioRespuesta: "domicilio" }));
    await expect(service.responderHoja(TIENDA, HOJA, { ...cuerpo, fechaEntregaCarta: "2026-10-01" }, user))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(service.responderHoja(TIENDA, HOJA, { ...cuerpo, fechaEntregaCarta: "2999-01-01" }, user))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe("listarHojasAdmin / resumenHojas", () => {
  it("abiertas: filtra pendiente+en_atencion y ordena por fecha límite", async () => {
    db.libro_reclamaciones.count.mockResolvedValue(1);
    db.libro_reclamaciones.findMany.mockResolvedValue([fila()]);

    const { data, meta } = await service.listarHojasAdmin(TIENDA, { estado: "abiertas", page: 1, limit: 20 }, "2026-10-20");

    const args = db.libro_reclamaciones.findMany.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ estado: { in: ["pendiente", "en_atencion"] } });
    expect(args.orderBy[0]).toEqual({ fechaLimite: "asc" });
    expect(data[0]).toEqual(expect.objectContaining({ numero: "00001-2026", semaforo: "ambar", diasRestantes: 5 }));
    expect(meta.total).toBe(1);
  });

  it("el semáforo se traduce a rangos de fecha_limite", async () => {
    db.libro_reclamaciones.count.mockResolvedValue(0);
    await service.resumenHojas(TIENDA, "2026-10-20");

    const [, porVencer, vencidas] = db.libro_reclamaciones.count.mock.calls.map(c => c[0].where);
    expect(porVencer.fechaLimite.gt.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(porVencer.fechaLimite.lte.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect(vencidas.fechaLimite.lte.toISOString().slice(0, 10)).toBe("2026-10-20");
  });
});

describe("exportarHojasCsv", () => {
  it("CSV con BOM, separador ; y escape de fórmulas", async () => {
    db.libro_reclamaciones.findMany.mockResolvedValue([fila({ detalle: "=HYPERLINK(\"x\")" })]);
    const csv = await service.exportarHojasCsv(TIENDA, { desde: "2026-10-01" });

    expect(csv.startsWith("﻿N° hoja;")).toBe(true);
    expect(csv).toContain("00001-2026");
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    const where = db.libro_reclamaciones.findMany.mock.calls[0][0].where;
    expect(where.AND[1].fechaRegistro.gte.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});
