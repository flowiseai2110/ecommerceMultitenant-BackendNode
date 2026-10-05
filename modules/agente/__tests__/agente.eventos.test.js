import { jest } from "@jest/globals";

// Perfil de eventos del asesor (mini booking, spec R13): el estado de las
// entradas es real (hay / últimas / agotado), pero sin precios ni cantidades.
process.env.AGENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { tiendas: { findUnique: jest.fn(async () => ({ direccion: "Jr. Ica 377, Lima" })) } },
  Prisma: {}
}));
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn(),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos: jest.fn()
}));

const sabado = "2026-10-10T01:00:00.000Z"; // viernes 09/10 20:00 de Lima
const evento = {
  id: "e1", nombre: "Stand up de Carlos", slug: "stand-up", descripcionCorta: "Comedia en vivo", lugar: "Teatro Municipal",
  edadMinima: 14, imagenes: [{ url: "https://img/su.jpg", alt: "Stand up" }], agotado: false,
  desde: { precio: 50, etiqueta: "por entrada" },
  funciones: [{
    id: "f1", nombre: null, inicio: sabado, fin: null, estado: "disponible",
    tipos: [{ id: "gen", nombre: "General", precio: 50, estado: "ultimas", quedan: 3 }, { id: "vip", nombre: "VIP", precio: 120, estado: "agotado", quedan: null }]
  }]
};
jest.unstable_mockModule("../../reservas/eventos/eventos.service.js", () => ({
  listarEventosStore: jest.fn(async () => [evento]),
  obtenerEventoStore: jest.fn(async () => evento)
}));
jest.unstable_mockModule("../../reservas/reservas.config.service.js", () => ({
  obtenerConfig: jest.fn(async () => ({ apartadoManualMin: 120, maxEntradasPorCompra: 10, cierrePagoManualHoras: 3, politicaCancelacion: null, instrucciones: null }))
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const tool = (name, input = {}) => ({ type: "tool_use", id: `tu_${name}`, name, input });
const turno = () => responderTurno({
  tiendaId: "11111111-1111-1111-1111-111111111111", tiendaNombre: "Ticketera", tipoNegocio: "eventos", mensaje: "¿quedan entradas?"
});
const resultadoTool = () => JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);

describe("asesor — perfil eventos", () => {
  beforeEach(() => create.mockReset());

  it("ofrece solo las herramientas de eventos", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "¡Hola!" }] });
    await turno();
    expect(create.mock.calls[0][0].tools.map(t => t.name)).toEqual(["ver_eventos", "info_organizador"]);
  });

  it("ver_eventos informa el estado de cada entrada sin precios ni cuántas quedan", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ver_eventos", { texto: "stand up" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Quedan las últimas generales." }] });
    const res = await turno();
    const r = resultadoTool();
    expect(r.eventos[0].funciones[0].entradas).toEqual([
      { tipo: "General", estado: "últimas entradas" }, { tipo: "VIP", estado: "agotado" }
    ]);
    expect(r.eventos[0].funciones[0].cuando).toBe("viernes 09/10/2026 20:00");
    expect(JSON.stringify(r)).not.toMatch(/precio|"50|120|quedan/);
    expect(res.productos[0]).toEqual(expect.objectContaining({ id: "e1", precioBase: 50, ruta: "eventos/stand-up" }));
  });

  it("info_organizador explica el apartado y el cierre de la venta en línea", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("info_organizador")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Tienes 2 horas para pagar." }] });
    await turno();
    expect(resultadoTool()).toMatchObject({ minutos_para_pagar: 120, cierre_venta_en_linea: "3 horas antes de cada función" });
  });
});
