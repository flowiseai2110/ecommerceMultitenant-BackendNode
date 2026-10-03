import { jest } from "@jest/globals";

// Streaming del asesor (docs/specs/agente-ventas/spec.md, R7): deltas de texto,
// tarjetas antes que el texto, reinicio del preámbulo y degradación cuando el
// modelo no emite su primer token a tiempo. SDK de Anthropic simulado.
process.env.AGENTE_IA_API_KEY = "test-key";
process.env.AGENTE_IA_PRIMER_TOKEN_MS = "50";

/**
 * MessageStream falso: emite los textos (cada uno como bloque/delta) y
 * resuelve con el mensaje final. Con `colgado`, nunca emite nada: solo
 * termina si lo abortan.
 */
function streamFalso({ textos = [], final, colgado = false }) {
  const handlers = {};
  let abortar;
  const s = {
    aborted: false,
    on(evento, cb) { (handlers[evento] ??= []).push(cb); return s; },
    abort() { s.aborted = true; abortar?.(new Error("aborted")); },
    finalMessage() {
      return new Promise((resolve, reject) => {
        abortar = reject;
        if (colgado) return;
        setImmediate(() => {
          for (const t of textos) {
            handlers.streamEvent?.forEach(cb => cb({ type: "content_block_delta" }));
            handlers.text?.forEach(cb => cb(t));
          }
          resolve(final);
        });
      });
    }
  };
  return s;
}

const stream = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.messages = { stream, create: jest.fn() }; } }
}));
jest.unstable_mockModule("../../../config/prisma.js", () => ({ prisma: {}, Prisma: {} }));

const producto = {
  id: "p1", nombre: "Running Boost", categoria: "Hombre", colores: [], descripcionCorta: "",
  precioBase: "150.00", precioOferta: null, stock: 3, totalVariantes: 0, variantesDisponibles: []
};
const ejecutarBuscarProductos = jest.fn();
jest.unstable_mockModule("../tools/buscar-productos.js", () => ({
  obtenerFacetas: jest.fn().mockResolvedValue({ categorias: [], colores: [], opciones: [] }),
  buildBuscarProductosToolDef: jest.fn().mockReturnValue({ name: "buscar_productos", input_schema: {} }),
  ejecutarBuscarProductos
}));

const { responderTurno } = await import("../agente.service.js");

const usage = { input_tokens: 100, output_tokens: 20 };
const buscar = { type: "tool_use", id: "tu_1", name: "buscar_productos", input: { query: "zapatillas" } };

function emisorEspia() {
  const eventos = [];
  return {
    eventos,
    texto: (d) => eventos.push(["texto", d]),
    productos: (ps) => eventos.push(["productos", ps.map(p => p.id)]),
    reinicio: () => eventos.push(["reinicio"])
  };
}

const turno = (emisor) =>
  responderTurno({ tiendaId: "11111111-1111-1111-1111-111111111111", mensaje: "zapatillas running", emisor });

beforeEach(() => {
  stream.mockReset();
  ejecutarBuscarProductos.mockReset();
});

describe("responderTurno con streaming", () => {
  it("reinicia el preámbulo, manda tarjetas y luego el texto en deltas", async () => {
    ejecutarBuscarProductos.mockResolvedValue({ productos: [producto] });
    stream
      .mockReturnValueOnce(streamFalso({
        textos: ["Déjame buscar…"],
        final: { stop_reason: "tool_use", usage, content: [{ type: "text", text: "Déjame buscar…" }, buscar] }
      }))
      .mockReturnValueOnce(streamFalso({
        textos: ["Te recomiendo ", "la Running Boost."],
        final: { stop_reason: "end_turn", usage, content: [{ type: "text", text: "Te recomiendo la Running Boost." }] }
      }));
    const emisor = emisorEspia();

    const res = await turno(emisor);

    expect(emisor.eventos).toEqual([
      ["texto", "Déjame buscar…"],
      ["reinicio"],
      ["productos", ["p1"]],
      ["texto", "Te recomiendo "],
      ["texto", "la Running Boost."]
    ]);
    expect(res.mensaje).toBe("Te recomiendo la Running Boost.");
    expect(res.senales).toEqual({ busquedasSinResultados: 0, errorHerramienta: false });
  });

  it("sin primer token a tiempo: aborta y responde con tarjetas de una búsqueda directa", async () => {
    ejecutarBuscarProductos.mockResolvedValue({ productos: [producto] });
    stream.mockReturnValueOnce(streamFalso({ colgado: true }));
    const emisor = emisorEspia();

    const res = await turno(emisor);

    expect(ejecutarBuscarProductos.mock.calls[0][0].input).toEqual({ query: "zapatillas running" });
    expect(res.productos.map(p => p.id)).toEqual(["p1"]);
    expect(res.mensaje).toContain("opciones");
    expect(emisor.eventos).toContainEqual(["productos", ["p1"]]);
  });

  it("sin primer token y sin productos: pide repetir, no lanza error", async () => {
    ejecutarBuscarProductos.mockResolvedValue({ productos: [] });
    stream.mockReturnValueOnce(streamFalso({ colgado: true }));

    const res = await turno(emisorEspia());

    expect(res.productos).toEqual([]);
    expect(res.mensaje).toContain("repites");
  });

  it("cuenta las búsquedas sin resultados (señal de fallo)", async () => {
    ejecutarBuscarProductos.mockResolvedValue({ productos: [] });
    stream
      .mockReturnValueOnce(streamFalso({ final: { stop_reason: "tool_use", usage, content: [buscar] } }))
      .mockReturnValueOnce(streamFalso({
        textos: ["No tengo eso."],
        final: { stop_reason: "end_turn", usage, content: [{ type: "text", text: "No tengo eso." }] }
      }));

    const res = await turno(emisorEspia());

    expect(res.senales.busquedasSinResultados).toBe(1);
  });
});
