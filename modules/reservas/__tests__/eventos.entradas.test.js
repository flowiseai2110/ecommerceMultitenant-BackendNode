import { jest } from "@jest/globals";

// Entradas con QR (docs/specs/plantillas-por-rubro E6): una por persona al
// confirmar, emisión idempotente y validación en la puerta que no deja entrar
// dos veces.

const prisma = {
  evento_entradas: { findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() }
};
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, Prisma: {}, default: prisma }));

const { emitirEntradas, generarCodigo, normalizarCodigo, validarEntrada } = await import("../eventos/entradas.js");

const TIENDA = "t-1";

beforeEach(() => jest.clearAllMocks());

describe("códigos", () => {
  test("10 caracteres sin letras ni números que se confunden", () => {
    for (let i = 0; i < 50; i++) expect(generarCodigo()).toMatch(/^[A-HJ-KMNP-Z2-9]{10}$/);
  });
  test("lo escaneado o dictado se normaliza", () => {
    expect(normalizarCodigo(" abcd-efgh 23 ")).toBe("ABCDEFGH23");
  });
});

describe("emitirEntradas", () => {
  function tx(yaEmitidas = 0) {
    return {
      evento_entradas: { count: jest.fn(async () => yaEmitidas), createMany: jest.fn(async () => ({})) },
      evento_compra_items: {
        findMany: jest.fn(async () => [
          { tipoEntradaId: "vip", nombre: "VIP", cantidad: 1, precio: 100 },
          { tipoEntradaId: "gen", nombre: "General", cantidad: 2, precio: 50 }
        ])
      },
      reservas: { findUnique: jest.fn(async () => ({ funcionId: "f-1" })) }
    };
  }

  test("una entrada por persona, numeradas y con código propio", async () => {
    const t = tx();
    await emitirEntradas(t, { tiendaId: TIENDA, pedidoId: "p-1" });
    const { data } = t.evento_entradas.createMany.mock.calls[0][0];
    expect(data.map(e => [e.numero, e.tipoNombre, e.funcionId])).toEqual([[1, "VIP", "f-1"], [2, "General", "f-1"], [3, "General", "f-1"]]);
    expect(new Set(data.map(e => e.codigo)).size).toBe(3);
  });

  test("si ya se emitieron no repite (la confirmación llega dos veces)", async () => {
    const t = tx(3);
    await emitirEntradas(t, { tiendaId: TIENDA, pedidoId: "p-1" });
    expect(t.evento_entradas.createMany).not.toHaveBeenCalled();
  });
});

describe("validarEntrada", () => {
  const entrada = (extra = {}) => ({
    id: "e-1", codigo: "ABCDEFGH23", numero: 1, tipoNombre: "General", funcionId: "f-1", usadaEn: null, anulada: false,
    pedido: {
      numeroPedido: "PED-1", estado: "confirmada",
      reserva: { titularNombres: "Lucía", titularApellidos: "Rojas", producto: { nombre: "Jazz" }, funcion: { id: "f-1", nombre: null, inicio: new Date() } }
    },
    ...extra
  });

  test("una entrada válida queda usada", async () => {
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada());
    prisma.evento_entradas.updateMany.mockResolvedValue({ count: 1 });
    const r = await validarEntrada(TIENDA, "abcd-efgh-23", { email: "puerta@x.pe" });
    expect(r).toMatchObject({ codigo: "ABCDEFGH23", titular: "Lucía Rojas", evento: "Jazz", tipo: "General" });
    expect(prisma.evento_entradas.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tiendaId: TIENDA, codigo: "ABCDEFGH23" } }));
    expect(prisma.evento_entradas.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "e-1", usadaEn: null }, data: expect.objectContaining({ usadaPor: "puerta@x.pe" })
    }));
  });

  test("ya usada: 409 YA_USADA con la hora en que entró", async () => {
    const usadaEn = new Date("2026-11-21T21:05:00-05:00");
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada({ usadaEn }));
    const e = await validarEntrada(TIENDA, "ABCDEFGH23", null).catch(x => x);
    expect(e.statusCode).toBe(409);
    expect(e.details).toMatchObject({ motivo: "YA_USADA", entrada: { usadaEn } });
    expect(prisma.evento_entradas.updateMany).not.toHaveBeenCalled();
  });

  test("dos puertas a la vez: solo una la marca", async () => {
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada());
    prisma.evento_entradas.updateMany.mockResolvedValue({ count: 0 });
    await expect(validarEntrada(TIENDA, "ABCDEFGH23", null)).rejects.toMatchObject({ details: { motivo: "YA_USADA" } });
  });

  test("anulada o compra no pagada: 409 ANULADA", async () => {
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada({ anulada: true }));
    await expect(validarEntrada(TIENDA, "ABCDEFGH23", null)).rejects.toMatchObject({ details: { motivo: "ANULADA" } });
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada({ pedido: { ...entrada().pedido, estado: "cancelada" } }));
    await expect(validarEntrada(TIENDA, "ABCDEFGH23", null)).rejects.toMatchObject({ details: { motivo: "ANULADA" } });
  });

  test("de otra función: se avisa y no se marca", async () => {
    prisma.evento_entradas.findFirst.mockResolvedValue(entrada());
    await expect(validarEntrada(TIENDA, "ABCDEFGH23", null, { funcionId: "f-2" })).rejects.toMatchObject({ details: { motivo: "OTRA_FUNCION" } });
    expect(prisma.evento_entradas.updateMany).not.toHaveBeenCalled();
  });

  test("código que no existe: 404", async () => {
    prisma.evento_entradas.findFirst.mockResolvedValue(null);
    await expect(validarEntrada(TIENDA, "XXXXXXXX22", null)).rejects.toMatchObject({ statusCode: 404 });
  });
});
