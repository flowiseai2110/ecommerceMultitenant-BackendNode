import { jest } from "@jest/globals";

// Tools calcular_envio y estado_pedido (docs/specs/agente-ventas/spec.md,
// R9 y R11): el modelo nunca recibe montos y la identidad sale del servidor.

const findMany = jest.fn();
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { pedidos: { findMany } },
  Prisma: {}
}));

const cotizarEnvios = jest.fn();
jest.unstable_mockModule("../../envios/cotizacion.service.js", () => ({ cotizarEnvios }));

const { ejecutarCalcularEnvio } = await import("../tools/calcular-envio.js");
const { ejecutarEstadoPedido } = await import("../tools/estado-pedido.js");

const TIENDA = "8f14e45f-ceea-467a-9a36-dedd4bea2543";
const facetas = { tienda: { ubigeo: "150101", envioGratisMinimo: 200 } };

beforeEach(() => jest.clearAllMocks());

describe("calcular_envio", () => {
  const cotizacion = [
    { nombre: "Delivery Lima", modo: "fijo", costo: 12, costoReferencial: null, diasMin: 1, diasMax: 2, disponible: true },
    { nombre: "Recojo en tienda", modo: "gratis", costo: 0, costoReferencial: null, diasMin: null, diasMax: null, disponible: true },
    { nombre: "Shalom", modo: "coordinar", costo: 0, costoReferencial: null, diasMin: null, diasMax: null, disponible: false }
  ];

  it("resuelve el distrito y cotiza con el mismo servicio del checkout", async () => {
    cotizarEnvios.mockResolvedValue(cotizacion);

    const r = await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: { distrito: "Surco" }, facetas });

    expect(cotizarEnvios).toHaveBeenCalledWith(TIENDA, { ubigeo: "150140" });
    expect(r.paraModelo).toEqual({
      distrito: "Santiago de Surco, Lima",
      opciones: [
        { metodo: "Delivery Lima", tipo: "con_costo", plazo: "1 a 2 días" },
        { metodo: "Recojo en tienda", tipo: "gratis", plazo: null }
      ],
      hay_envio_gratis_por_monto: true
    });
    expect(r.envio.opciones[0]).toMatchObject({ nombre: "Delivery Lima", costo: 12 });
    expect(r.envio.envioGratisMinimo).toBe(200);
  });

  it("el modelo no recibe ningún monto", async () => {
    cotizarEnvios.mockResolvedValue(cotizacion);
    const r = await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: { distrito: "Surco" }, facetas });
    expect(JSON.stringify(r.paraModelo)).not.toMatch(/\b(12|200)\b|"costo/);
  });

  it("distrito ambiguo → opciones como botones, sin cotizar", async () => {
    const r = await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: { distrito: "san isidro" }, facetas: {} });

    expect(r.paraModelo.error).toBe("DISTRITO_AMBIGUO");
    expect(r.sugerencias).toEqual(expect.arrayContaining(["San Isidro, Lima"]));
    expect(cotizarEnvios).not.toHaveBeenCalled();
  });

  it("sin métodos disponibles → DISTRITO_NO_CUBIERTO", async () => {
    cotizarEnvios.mockResolvedValue([{ ...cotizacion[2] }]);
    const r = await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: { distrito: "Cayma, Arequipa" }, facetas });
    expect(r.paraModelo).toEqual({ error: "DISTRITO_NO_CUBIERTO", distrito: "Cayma, Arequipa" });
  });

  it("distrito irreconocible o vacío", async () => {
    expect((await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: { distrito: "xyz" }, facetas })).paraModelo.error)
      .toBe("DISTRITO_NO_ENCONTRADO");
    expect((await ejecutarCalcularEnvio({ tiendaId: TIENDA, input: {}, facetas })).paraModelo.error)
      .toBe("PARAMETRO_INVALIDO");
  });
});

describe("estado_pedido", () => {
  const pedido = {
    numeroPedido: "PED-0007", estado: "enviado", estadoPago: "pagado", metodoEnvio: "Delivery",
    courier: null, fechaRegistro: new Date("2026-10-01T10:00:00Z"), fechaEntregado: null
  };

  it("sin sesión → NO_AUTENTICADO, sin tocar la BD", async () => {
    const r = await ejecutarEstadoPedido({ tiendaId: TIENDA, authUserId: null, input: { numero_pedido: "PED-0007" } });
    expect(r.paraModelo).toEqual({ error: "NO_AUTENTICADO" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("filtra por tienda y por el dueño de la sesión", async () => {
    findMany.mockResolvedValue([pedido]);

    const r = await ejecutarEstadoPedido({ tiendaId: TIENDA, authUserId: "u1", input: { numero_pedido: " ped-0007 " } });

    expect(findMany.mock.calls[0][0].where).toEqual({ tiendaId: TIENDA, authUserId: "u1", numeroPedido: "PED-0007" });
    expect(r.paraModelo.pedidos[0]).toEqual({
      numero: "PED-0007", estado: "enviado", estado_pago: "pagado", envio: "Delivery",
      fecha_pedido: "2026-10-01", fecha_entrega: null
    });
    expect(r.pedidos).toEqual([{ numeroPedido: "PED-0007", estado: "enviado" }]);
  });

  it("sin número devuelve los últimos pedidos", async () => {
    findMany.mockResolvedValue([pedido]);
    await ejecutarEstadoPedido({ tiendaId: TIENDA, authUserId: "u1", input: {} });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { tiendaId: TIENDA, authUserId: "u1" }, take: 3 });
  });

  it("un número ajeno o inexistente → NO_ENCONTRADO (no revela si existe)", async () => {
    findMany.mockResolvedValue([]);
    const r = await ejecutarEstadoPedido({ tiendaId: TIENDA, authUserId: "u1", input: { numero_pedido: "PED-0001" } });
    expect(r.paraModelo).toEqual({ error: "NO_ENCONTRADO" });
  });
});
