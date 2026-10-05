import { jest } from "@jest/globals";

// Perfil de agencia de tours del asesor (mini booking, spec R13): sus
// herramientas, orden por más pedidos, salida de una fecha sin afirmar cupo y
// sin montos para el modelo.
process.env.AGENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
const groupBy = jest.fn(async () => [{ productoId: "t2", _count: { _all: 5 } }, { productoId: "t1", _count: { _all: 1 } }]);
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: {
    tiendas: { findUnique: jest.fn(async () => ({ direccion: "Av. Paracas 120" })) },
    reservas: { groupBy }
  },
  Prisma: {}
}));
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn(),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos: jest.fn()
}));

const tours = [
  {
    id: "t1", nombre: "Islas Ballestas", slug: "islas-ballestas", descripcionCorta: "Lobos marinos y pingüinos en Paracas",
    imagenes: [{ url: "https://img/ballestas.jpg", alt: "Ballestas" }], destacado: true,
    duracion: "2 horas", diasSalida: [2, 3, 4, 5, 6, 7], diasSalidaTexto: "martes a domingo", horasSalida: ["08:00", "10:00"],
    idiomas: ["es", "en"], edadMinima: null, desde: { precio: 60, etiqueta: "por adulto" }
  },
  {
    id: "t2", nombre: "Huacachina full day", slug: "huacachina", descripcionCorta: "Tubulares y sandboard",
    imagenes: [], destacado: false,
    duracion: "Full day", diasSalida: [6, 7], diasSalidaTexto: "sábados y domingos", horasSalida: ["07:00"],
    idiomas: ["es"], edadMinima: 8, desde: { precio: 150, etiqueta: "por adulto" }
  }
];
jest.unstable_mockModule("../../reservas/tours/tours.service.js", () => ({ listarToursStore: jest.fn(async () => tours) }));
const cierresPublicos = jest.fn(async () => []);
jest.unstable_mockModule("../../reservas/cierres.service.js", () => ({ cierresPublicos }));
jest.unstable_mockModule("../../reservas/reservas.config.service.js", () => ({
  obtenerConfig: jest.fn(async () => ({
    modoConfirmacion: "solicitud", cobro: "adelanto", adelantoPct: 30, politicaCancelacion: "Cambios hasta 24 h antes.", instrucciones: null
  }))
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const tool = (name, input = {}) => ({ type: "tool_use", id: `tu_${name}`, name, input });
const turno = () => responderTurno({
  tiendaId: "11111111-1111-1111-1111-111111111111", tiendaNombre: "Paracas Tours", tipoNegocio: "tours", mensaje: "¿qué tours hay el sábado?"
});
const resultadoTool = () => JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);

describe("asesor — perfil tours", () => {
  beforeEach(() => { create.mockReset(); cierresPublicos.mockClear(); });

  it("ofrece solo las herramientas de la agencia y el prompt dice que la agencia confirma", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "¡Hola!" }] });
    await turno();
    const params = create.mock.calls[0][0];
    expect(params.tools.map(t => t.name)).toEqual(["buscar_tours", "info_agencia"]);
    expect(params.system).toContain("NUNCA afirmes que hay cupo");
  });

  it("buscar_tours ordena por más pedidos, dice si sale ese día y no manda montos", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("buscar_tours", { fecha: "2026-10-10" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "El sábado salen los dos." }] });

    const res = await turno();

    const r = resultadoTool();
    expect(r.tours.map(t => t.nombre)).toEqual(["Huacachina full day", "Islas Ballestas"]);
    expect(r.tours[0]).toMatchObject({ sale_ese_dia: true, es_de_los_mas_pedidos: true });
    expect(JSON.stringify(r)).not.toMatch(/precio"|150|"60/);
    expect(res.productos[0]).toEqual(expect.objectContaining({ id: "t2", precioBase: 150, ruta: "tours/huacachina" }));
  });

  it("un lunes sin salida o una fecha cerrada se informan como sin salida", async () => {
    cierresPublicos.mockResolvedValueOnce([{ productoId: "t1", fechaDesde: "2026-10-13", fechaHasta: "2026-10-13" }]);
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("buscar_tours", { fecha: "2026-10-13" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Ese día no hay salidas." }] });
    await turno();
    const r = resultadoTool();
    const ballestas = r.tours.find(t => t.nombre === "Islas Ballestas");
    expect(ballestas).toMatchObject({ sale_ese_dia: false, fecha_cerrada: true });
    expect(r.tours.find(t => t.nombre === "Huacachina full day").sale_ese_dia).toBe(false);
  });

  it("filtra por texto sin importar tildes", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("buscar_tours", { texto: "pinguinos" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Te recomiendo Ballestas." }] });
    await turno();
    expect(resultadoTool().tours.map(t => t.nombre)).toEqual(["Islas Ballestas"]);
  });

  it("info_agencia explica el adelanto y el saldo en destino", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("info_agencia")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Se paga un adelanto." }] });
    await turno();
    expect(resultadoTool()).toMatchObject({ cobro: expect.stringContaining("adelanto del 30%"), direccion: "Av. Paracas 120" });
  });

  it("una herramienta de hotel en una agencia responde desconocida", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ver_habitaciones")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Hola" }] });
    await turno();
    expect(resultadoTool().error).toContain("Herramienta desconocida");
  });
});
