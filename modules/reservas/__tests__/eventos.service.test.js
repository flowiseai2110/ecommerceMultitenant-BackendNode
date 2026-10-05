import { jest } from "@jest/globals";

// Cupo de eventos con la BD simulada: la compra bloquea los tipos, vuelve a
// contar con lo apartado y nunca registra más entradas de las que quedan.
const TIENDA = "22222222-2222-4222-8222-222222222222";

const prisma = { $queryRaw: jest.fn() };
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma, default: prisma }));
jest.unstable_mockModule("../../catalogo/productos.cache.js", () => ({ invalidateProductoDetailCache: jest.fn() }));
jest.unstable_mockModule("../reservas.config.service.js", () => ({ obtenerConfig: jest.fn() }));

const { apartarEntradas, moverVendidos } = await import("../eventos/eventos.service.js");

function txCon({ tipos, apartadas = [], items = [] }) {
  const tx = {
    $queryRaw: jest.fn(async (strings) => (strings.join("").includes("SUM(i.cantidad)") ? apartadas : [])),
    evento_tipos_entrada: { findMany: jest.fn(async () => tipos), update: jest.fn() },
    evento_compra_items: { createMany: jest.fn(), findMany: jest.fn(async () => items) }
  };
  return tx;
}

const vip = { id: "vip", nombre: "VIP", cupo: 20, vendidos: 18 };
const item = (cantidad) => ({ tipoEntradaId: "vip", nombre: "VIP", cantidad, precio: 120 });

describe("apartarEntradas", () => {
  it("bloquea los tipos (FOR UPDATE) y registra las entradas si alcanza el cupo", async () => {
    const tx = txCon({ tipos: [vip] });
    await apartarEntradas(tx, { tiendaId: TIENDA, pedidoId: "p1", items: [item(2)] });
    const sqls = tx.$queryRaw.mock.calls.map(c => c[0].join(""));
    expect(sqls.some(q => q.includes("FOR UPDATE"))).toBe(true);
    expect(tx.evento_compra_items.createMany).toHaveBeenCalledWith({
      data: [{ tiendaId: TIENDA, pedidoId: "p1", tipoEntradaId: "vip", nombre: "VIP", cantidad: 2, precio: 120 }]
    });
    expect(tx.evento_tipos_entrada.update).not.toHaveBeenCalled();
  });

  it("con lo apartado por otra compra, la última entrada ya no está: 409 AGOTADO", async () => {
    const tx = txCon({ tipos: [vip], apartadas: [{ id: "vip", apartadas: 2 }] });
    await expect(apartarEntradas(tx, { tiendaId: TIENDA, pedidoId: "p2", items: [item(1)] }))
      .rejects.toMatchObject({ statusCode: 409, details: expect.objectContaining({ motivo: "AGOTADO", quedan: 0 }) });
    expect(tx.evento_compra_items.createMany).not.toHaveBeenCalled();
  });

  it("una entrada libre se confirma en el acto: suma a vendidos", async () => {
    const tx = txCon({ tipos: [vip] });
    await apartarEntradas(tx, { tiendaId: TIENDA, pedidoId: "p3", items: [item(1)], confirmar: true });
    expect(tx.evento_tipos_entrada.update).toHaveBeenCalledWith({ where: { id: "vip" }, data: { vendidos: { increment: 1 } } });
  });
});

describe("moverVendidos", () => {
  it("al cancelar una compra confirmada, resta sus entradas", async () => {
    const tx = txCon({ tipos: [vip], items: [item(2)] });
    await moverVendidos(tx, TIENDA, "p1", -1);
    expect(tx.evento_tipos_entrada.update).toHaveBeenCalledWith({ where: { id: "vip" }, data: { vendidos: { decrement: 2 } } });
  });
});
