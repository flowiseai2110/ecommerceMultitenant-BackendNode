import { jest } from "@jest/globals";

// Perfil de hotel del asesor (mini booking, spec R13): otras herramientas, sin
// montos para el modelo, tarjetas con ruta a la ficha de la habitación y nunca
// las herramientas del ecommerce.
process.env.AGENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { tiendas: { findUnique: jest.fn(async () => ({ direccion: "Av. Universitaria 4690, Los Olivos" })) } },
  Prisma: {}
}));
const ejecutarBuscarProductos = jest.fn();
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn(),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos
}));

const habitaciones = [
  {
    id: "h1", nombre: "Matrimonial", slug: "matrimonial", imagenes: [{ url: "https://img/mt.jpg", alt: "Matrimonial" }],
    capacidadAdultos: 2, capacidadNinos: 0, capacidadMax: 2, porPersona: false, camas: "1 de dos plazas", amenities: ["TV"],
    modalidades: [{ id: "m1", tipo: "horas", horas: 6, precio: 100, etiqueta: "6 horas" }, { id: "m2", tipo: "noche", precio: 160, etiqueta: "Noche" }],
    desde: { precio: 100, etiqueta: "6 horas" }
  },
  {
    id: "h2", nombre: "Suite Presidencial", slug: "suite", imagenes: [],
    capacidadAdultos: 2, capacidadNinos: 2, capacidadMax: 4, porPersona: false, camas: "King", amenities: ["Jacuzzi"],
    modalidades: [{ id: "m3", tipo: "noche", precio: 300, etiqueta: "Noche" }],
    desde: { precio: 300, etiqueta: "Por noche" }
  }
];
jest.unstable_mockModule("../../reservas/hotel/habitaciones.service.js", () => ({
  listarHabitacionesStore: jest.fn(async () => habitaciones)
}));
jest.unstable_mockModule("../../reservas/reservas.config.service.js", () => ({
  obtenerConfig: jest.fn(async () => ({
    horaCheckin: "14:00", horaCheckout: "12:00", modoConfirmacion: "solicitud", cobro: "total", adelantoPct: null,
    comprobanteEn: "en_el_servicio", politicaCancelacion: "Sin reembolso si no te presentas.", instrucciones: "Presentar DNI"
  }))
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const tool = (name, input = {}) => ({ type: "tool_use", id: `tu_${name}`, name, input });
const turno = () => responderTurno({
  tiendaId: "11111111-1111-1111-1111-111111111111", tiendaNombre: "Verona", tipoNegocio: "hotel", mensaje: "¿tienen por horas?"
});

describe("asesor — perfil hotel", () => {
  beforeEach(() => create.mockReset());

  it("ofrece solo las herramientas del hotel y el prompt dice que el hotel confirma", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "¡Hola! ¿Para cuántas personas?" }] });
    await turno();
    const params = create.mock.calls[0][0];
    expect(params.tools.map(t => t.name)).toEqual(["ver_habitaciones", "info_hotel"]);
    expect(params.system).toContain("NUNCA afirmes que hay disponibilidad");
    expect(params.system).toMatch(/Hoy es \w+ \d{2}\/\d{2}\/\d{4}/);
  });

  it("ver_habitaciones: el modelo recibe indicadores sin montos; las tarjetas llevan precio y ruta", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ver_habitaciones", { modalidad: "horas" })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "La Matrimonial tiene tarifa de 6 horas." }] });

    const res = await turno();

    const toolResult = JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(toolResult.habitaciones).toHaveLength(1);
    expect(toolResult.habitaciones[0]).toMatchObject({ nombre: "Matrimonial", tiene_tarifa_por_horas: true, modalidades: ["6 horas", "Noche"] });
    expect(JSON.stringify(toolResult)).not.toMatch(/precio"|100|160|300/);
    expect(res.productos).toEqual([expect.objectContaining({ id: "h1", precioBase: 100, ruta: "habitaciones/matrimonial" })]);
    expect(ejecutarBuscarProductos).not.toHaveBeenCalled();
  });

  it("info_hotel devuelve horarios, cobro y política sin montos", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("info_hotel")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "El check-in es a las 14:00." }] });
    await turno();
    const toolResult = JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(toolResult).toMatchObject({ hora_checkin: "14:00", hora_checkout: "12:00", direccion: "Av. Universitaria 4690, Los Olivos" });
    expect(toolResult.comprobante).toContain("al finalizar la estadía");
  });

  it("una herramienta de hotel en una tienda de productos responde desconocida", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ver_habitaciones")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Hola" }] });
    const { obtenerFacetas } = await import("../tools/buscar-productos.js");
    obtenerFacetas.mockResolvedValue({ categorias: [], colores: [], opciones: [] });
    await responderTurno({ tiendaId: "11111111-1111-1111-1111-111111111111", mensaje: "hola" });
    const toolResult = JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(toolResult.error).toContain("Herramienta desconocida");
  });
});
