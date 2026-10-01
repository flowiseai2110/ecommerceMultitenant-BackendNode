import { jest } from "@jest/globals";

// Loop de tool-use del asistente con el SDK de Anthropic simulado: verifica
// cuántas llamadas al LLM hace cada turno (costo y latencia).
process.env.ASISTENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { tiendas: { findUnique: jest.fn().mockResolvedValue({ nombre: "Zap Terrex" }) } }
}));
jest.unstable_mockModule("../asistente.progreso.js", () => ({
  obtenerProgreso: jest.fn().mockResolvedValue({ completados: 1, total: 8, pasos: [] })
}));

const { responderTurno } = await import("../asistente.service.js");

const TIENDA_ID = "11111111-1111-1111-1111-111111111111";
const usage = { input_tokens: 100, output_tokens: 20 };
const texto = (text) => ({ type: "text", text });
const tool = (name, input, id = `tu_${name}`) => ({ type: "tool_use", id, name, input });

const turno = (extra = {}) =>
  responderTurno({ tiendaId: TIENDA_ID, rutaActual: "/productos", mensaje: "¿cómo creo un producto?", ...extra });

describe("responderTurno", () => {
  beforeEach(() => create.mockReset());

  it("con texto y solo herramientas de UI responde en UNA llamada", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      usage,
      content: [
        texto("Pulsa \"Nuevo Producto\"."),
        tool("iniciar_tour", { tourId: "crear-producto" }),
        tool("ir_a_pantalla", { ruta: "/productos" })
      ]
    });

    const res = await turno();

    expect(create).toHaveBeenCalledTimes(1);
    expect(res.mensaje).toBe("Pulsa \"Nuevo Producto\".");
    expect(res.acciones).toEqual([
      { tipo: "tour", tourId: "crear-producto" },
      { tipo: "navegar", ruta: "/productos" }
    ]);
  });

  it("si necesita datos (progreso) hace la segunda llamada", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        usage,
        content: [texto("Déjame revisar."), tool("consultar_progreso_tienda", {})]
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto("Te falta tu logo.")] });

    const res = await turno({ mensaje: "¿qué me falta?" });

    expect(create).toHaveBeenCalledTimes(2);
    expect(res.mensaje).toBe("Te falta tu logo.");
    const resultado = create.mock.calls[1][0].messages.at(-1).content[0];
    expect(JSON.parse(resultado.content).total).toBe(8);
  });

  it("si pidió botones sin escribir texto, hace la segunda llamada para obtenerlo", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ir_a_pantalla", { ruta: "/pedidos" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto("Ahí ves tus pedidos.")] });

    const res = await turno();

    expect(create).toHaveBeenCalledTimes(2);
    expect(res.mensaje).toBe("Ahí ves tus pedidos.");
    expect(res.acciones).toEqual([{ tipo: "navegar", ruta: "/pedidos" }]);
  });

  it("suma los tokens de todas las vueltas", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("consultar_progreso_tienda", {})] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [texto("ok")] });

    const res = await turno();

    expect(res.uso).toMatchObject({ entrada: 200, salida: 40 });
  });

  it("el bloque cacheable del system no depende de la tienda ni de la pantalla", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", usage, content: [texto("hola")] });

    await turno({ rutaActual: "/productos" });
    await turno({ rutaActual: "/pedidos" });

    const [a, b] = create.mock.calls.map(([req]) => req.system);
    expect(a[0].cache_control).toEqual({ type: "ephemeral" });
    expect(a[0].text).toBe(b[0].text);
    expect(a[0].text).not.toContain("Zap Terrex");
    expect(a[1].text).toContain("/productos");
    expect(b[1].text).toContain("/pedidos");
    expect(a[1].text).toContain("Zap Terrex");
  });
});
