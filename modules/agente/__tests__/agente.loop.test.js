import { jest } from "@jest/globals";

// Loop de tool-use del asesor con el SDK de Anthropic y la tool simulados
// (docs/specs/agente-ventas/spec.md, R6): el modelo no recibe precios y un
// monto en su texto se corrige.
process.env.AGENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {} }));

const productos = [
  { id: "p1", nombre: "Running Boost", categoria: "Hombre", colores: ["negro"], descripcionCorta: "Liviana",
    precioBase: "250.00", precioOferta: "180.00", stock: 5, totalVariantes: 0, variantesDisponibles: [] },
  { id: "p2", nombre: "Clásica", categoria: "Hombre", colores: ["blanco"], descripcionCorta: "Cuero",
    precioBase: "150.00", precioOferta: null, stock: 2, totalVariantes: 0, variantesDisponibles: [] }
];
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn().mockResolvedValue({ categorias: [], colores: [], opciones: [] }),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos: jest.fn().mockResolvedValue({ productos })
}));

const envio = { distrito: "Santiago de Surco, Lima", ubigeo: "150140", opciones: [], envioGratisMinimo: null };
jest.unstable_mockModule("../tools/calcular-envio.js", () => ({
  calcularEnvioToolDef: { name: "calcular_envio", input_schema: {} },
  ejecutarCalcularEnvio: jest.fn().mockResolvedValue({ paraModelo: { distrito: envio.distrito, opciones: [] }, envio })
}));
const ejecutarEstadoPedido = jest.fn().mockResolvedValue({ paraModelo: { error: "NO_AUTENTICADO" } });
jest.unstable_mockModule("../tools/estado-pedido.js", () => ({
  estadoPedidoToolDef: { name: "estado_pedido", input_schema: {} },
  ejecutarEstadoPedido
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const texto = (text) => ({ type: "text", text });
const buscar = { type: "tool_use", id: "tu_1", name: "buscar_productos", input: { query: "zapatillas", precioMax: 200 } };

const conBusqueda = (...respuestasFinales) => {
  create.mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [buscar] });
  for (const r of respuestasFinales) create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto(r)] });
};

const turno = () => responderTurno({ tiendaId: "11111111-1111-1111-1111-111111111111", mensaje: "zapatillas hasta 200" });

describe("responderTurno — precios fuera del LLM", () => {
  beforeEach(() => create.mockReset());

  it("el tool_result lleva indicadores y ningún precio", async () => {
    conBusqueda("Te recomiendo la Running Boost, está en oferta.");

    await turno();

    const mensajes = create.mock.calls[1][0].messages;
    const toolResult = JSON.parse(mensajes.at(-1).content[0].content);
    expect(toolResult.productos[0]).toMatchObject({ tiene_oferta: true, dentro_de_presupuesto: true });
    expect(toolResult.productos[1]).toMatchObject({ es_la_mas_economica: true });
    const serializado = JSON.stringify(toolResult);
    expect(serializado).not.toMatch(/precio(Base|Oferta)|250|180|150/);
  });

  it("las tarjetas sí conservan el precio de la base", async () => {
    conBusqueda("Te recomiendo la Running Boost.");
    const res = await turno();
    expect(res.productos[0].precioBase).toBe("250.00");
  });

  it("si el texto trae un monto, pide reescribir una vez", async () => {
    conBusqueda("La Running Boost está a S/ 180.", "La Running Boost está en oferta.");

    const res = await turno();

    expect(create).toHaveBeenCalledTimes(3);
    expect(res.mensaje).toBe("La Running Boost está en oferta.");
    expect(create.mock.calls[2][0].messages.at(-1).content).toContain("Nota del sistema");
  });

  it("si insiste con el monto, responde con plantilla", async () => {
    conBusqueda("Cuesta S/ 180.", "Sigue a 180 soles.");

    const res = await turno();

    expect(res.mensaje).not.toMatch(/180/);
    expect(res.mensaje).toContain("precio actualizado");
    expect(res.productos).toHaveLength(2);
  });
});

describe("responderTurno — varias herramientas", () => {
  beforeEach(() => create.mockReset());

  it("ejecuta las tools de una vuelta en paralelo y vuelve al LLM una sola vez", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        usage,
        content: [buscar, { type: "tool_use", id: "tu_2", name: "calcular_envio", input: { distrito: "Surco" } }]
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto("Llega a Surco, mira la tarjeta.")] });

    const res = await turno();

    expect(create).toHaveBeenCalledTimes(2);
    const toolResults = create.mock.calls[1][0].messages.at(-1).content;
    expect(toolResults.map(r => r.tool_use_id)).toEqual(["tu_1", "tu_2"]);
    expect(res.envio).toEqual(envio);
    expect(res.productos).toHaveLength(2);
  });

  it("estado_pedido recibe la identidad del servidor, no del modelo", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        usage,
        content: [{ type: "tool_use", id: "tu_3", name: "estado_pedido", input: { numero_pedido: "PED-1", authUserId: "intruso" } }]
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto("Inicia sesión para verlo.")] });

    await responderTurno({ tiendaId: "11111111-1111-1111-1111-111111111111", mensaje: "mi pedido", authUserId: "u-real" });

    expect(ejecutarEstadoPedido.mock.calls.at(-1)[0]).toMatchObject({ authUserId: "u-real" });
  });
});
