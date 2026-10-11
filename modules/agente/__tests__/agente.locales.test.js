import { jest } from "@jest/globals";

// Perfil de locales del asesor (alquiler-locales): sus herramientas, sin montos para
// el modelo, tarjetas con ruta a la ficha del salón y nunca las del ecommerce.
process.env.AGENTE_IA_API_KEY = "test-key";

const create = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { create }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({
  prisma: { tiendas: { findUnique: jest.fn(async () => ({ direccion: "Av. Los Olivos 123" })) } },
  Prisma: {}
}));
const ejecutarBuscarProductos = jest.fn();
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn(),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos
}));

const salones = {
  imperial: {
    id: "s1", nombre: "Salón Imperial", slug: "imperial", imagenes: [{ url: "https://img/imp.jpg", alt: "Imperial" }],
    aforoMaximo: 150, metros: 300, servicios: ["sonido_dj", "pista_baile"], porHoras: false, desde: 3500,
    turnos: [{ nombre: "Noche", horaInicio: "20:00", horaFin: "03:00", precios: { general: 3500 } }],
    paquetes: [{ nombre: "Buffet criollo", incluye: ["Buffet", "Mozos"], esPromocion: false, precios: { general: 90 } }]
  },
  terraza: {
    id: "s2", nombre: "Terraza", slug: "terraza", imagenes: [],
    aforoMaximo: 40, metros: 80, servicios: ["mesas"], porHoras: true, desde: 800,
    turnos: [], paquetes: [{ nombre: "Solo local", incluye: [], esPromocion: true, precios: { general: 800 } }]
  }
};
jest.unstable_mockModule("../../reservas/locales/salones.service.js", () => ({
  cargarSalonParaReserva: jest.fn(), guardarFichaSalon: jest.fn(), precioDesde: jest.fn(), publicable: jest.fn(),
  listarSalonesStore: jest.fn(async () => Object.values(salones).map(({ turnos, paquetes, ...s }) => s)),
  obtenerSalonStore: jest.fn(async (_, slug) => salones[slug])
}));
jest.unstable_mockModule("../../reservas/reservas.config.service.js", () => ({
  obtenerConfig: jest.fn(async () => ({
    modoConfirmacion: "solicitud", separacionTipo: "porcentaje", adelantoPct: 40, maxCuotas: 3, saldoDiasAntes: 30,
    garantiaMonto: 500, garantiaDevolucionDias: 3, reprogramacionesMax: 1, reprogramacionMinDias: 30,
    politicaTramos: [{ desdeDias: 60, separacionPct: 50, restoPct: 100 }, { desdeDias: 0, separacionPct: 0, restoPct: 0 }],
    proveedoresExternos: true, horaTope: "03:00", cotizacionVigenciaDias: 7, politicaCancelacion: null, instrucciones: null
  }))
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const tool = (name, input = {}) => ({ type: "tool_use", id: `tu_${name}`, name, input });
const turno = () => responderTurno({
  tiendaId: "11111111-1111-1111-1111-111111111111", tiendaNombre: "Casa Alborada", tipoNegocio: "locales", mensaje: "busco salón para 80"
});
const resultadoTool = () => JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);

describe("asesor — perfil locales", () => {
  beforeEach(() => create.mockReset());

  it("ofrece solo las herramientas del local y el prompt prohíbe afirmar fechas libres", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "¿Para cuántos invitados?" }] });
    await turno();
    const params = create.mock.calls[0][0];
    expect(params.tools.map(t => t.name)).toEqual(["ver_salones", "info_local"]);
    expect(params.system).toContain("NUNCA afirmes que una fecha está libre");
    expect(params.system).toMatch(/Hoy es \p{L}+ \d{2}\/\d{2}\/\d{4}/u);
  });

  it("ver_salones filtra por aforo; el modelo no recibe montos y las tarjetas llevan precio y ruta", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("ver_salones", { invitados: 80 })] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Te recomiendo el Salón Imperial." }] });
    const res = await turno();
    const r = resultadoTool();
    expect(r.salones).toHaveLength(1);
    expect(r.salones[0]).toMatchObject({
      nombre: "Salón Imperial", aforo_maximo: 150, entra_tu_grupo: true, servicios: ["Sonido dj", "Pista baile"],
      turnos: ["Noche (20:00–03:00)"], paquetes: [{ nombre: "Buffet criollo", incluye: ["Buffet", "Mozos"], es_promocion: false }]
    });
    expect(JSON.stringify(r)).not.toMatch(/precio|3500|800|"90"|:90/);
    expect(res.productos).toEqual([expect.objectContaining({ id: "s1", precioBase: 3500, ruta: "salones/imperial" })]);
    expect(ejecutarBuscarProductos).not.toHaveBeenCalled();
  });

  it("info_local explica separación, cuotas, garantía y tramos sin montos", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage, content: [tool("info_local")] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "Separas con el 40 %." }] });
    await turno();
    const r = resultadoTool();
    expect(r).toMatchObject({ cuotas_maximas: 3, pide_garantia: true, proveedores_propios: true, direccion: "Av. Los Olivos 123" });
    expect(r.separacion).toContain("40%");
    expect(r.cancelacion_por_tramos[0]).toEqual({ desde_dias_antes: 60, devuelve_pct_de_lo_pagado: 100, devuelve_pct_de_la_separacion: 50 });
    expect(JSON.stringify(r)).not.toMatch(/500/);
  });
});
