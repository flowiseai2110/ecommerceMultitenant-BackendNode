import { jest } from "@jest/globals";

// Fase 5 (Premium): reglas, transcripción y la llamada a Claude con el SDK simulado.
process.env.TRANSMISIONES_IA_API_KEY = "sk-ant-prueba";

const parse = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class { constructor() { this.beta = { messages: { parse } }; } }
}));

const { debeRetransmitir, descargaHasta, grabacionHasta } = await import("../transmisiones.reglas.js");
const { generarResumen, vttATexto } = await import("../transmisiones.resumen.js");

const en = (iso) => new Date(iso);
const funcion = { inicio: en("2026-10-17T16:00:00-05:00"), fin: en("2026-10-17T19:00:00-05:00") };
const premium = (extra = {}) => ({ plan: "premium", estado: "programada", terminadaEn: null, extensionMin: 0, guardarAnio: true, ...extra });

describe("reglas del Premium", () => {
  it("90 días en línea y descarga de un año incluida", () => {
    expect(grabacionHasta(premium(), funcion)).toEqual(en("2027-01-15T19:00:00-05:00"));
    expect(descargaHasta(premium({ guardarAnio: false }), funcion)).toEqual(en("2027-10-17T19:00:00-05:00"));
    expect(grabacionHasta({ ...premium(), plan: "privado" }, funcion)).toEqual(en("2026-11-16T19:00:00-05:00"));
  });

  it("la retransmisión emite desde la sala hasta el corte, no en la prueba previa ni en otros planes", () => {
    expect(debeRetransmitir(premium(), funcion, en("2026-10-17T14:00:00-05:00"))).toBe(false);
    expect(debeRetransmitir(premium(), funcion, en("2026-10-17T15:00:00-05:00"))).toBe(true);
    expect(debeRetransmitir(premium(), funcion, en("2026-10-17T19:05:00-05:00"))).toBe(false);
    expect(debeRetransmitir(premium({ plan: "privado" }), funcion, en("2026-10-17T17:00:00-05:00"))).toBe(false);
    expect(debeRetransmitir(premium({ terminadaEn: en("2026-10-17T17:00:00-05:00") }), funcion, en("2026-10-17T17:30:00-05:00"))).toBe(false);
  });
});

describe("vttATexto", () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBienvenidos\n\n00:00:04.000 --> 00:00:06.000\nBienvenidos\n\n01:02:03.500 --> 01:02:05.000\n<v Ana>¡Feliz cumpleaños!</v>\n\n00:05.000 --> 00:07.000\nHora corta";

  it("marca cada línea con su hora, suma el desfase de la parte y une repetidas", () => {
    expect(vttATexto(vtt, 3600)).toEqual(["[01:00:01] Bienvenidos", "[02:02:03] ¡Feliz cumpleaños!", "[01:00:05] Hora corta"]);
    expect(vttATexto("WEBVTT\n\n", 0)).toEqual([]);
  });
});

describe("generarResumen (R8.3)", () => {
  const lineas = Array.from({ length: 8 }, (_, i) => `00:0${i}:00.000 --> 00:0${i}:05.000\nFrase número ${i}`).join("\n\n");
  const vtt = `WEBVTT\n\n${lineas}`;
  const ok = (extra = {}) => ({
    stop_reason: "end_turn",
    usage: { input_tokens: 1200, output_tokens: 300 },
    parsed_output: {
      resumen: "  Fue una tarde alegre.  ",
      capitulos: [{ inicioSeg: 300.4, titulo: "La torta" }, { inicioSeg: 0, titulo: "Llegada" }],
      momentos: [{ inicioSeg: 360, descripcion: "Soplan las velas" }]
    },
    ...extra
  });

  beforeEach(() => parse.mockReset());

  it("llama a Claude con salida estructurada, effort y fallbacks, y ordena capítulos", async () => {
    parse.mockResolvedValue(ok());
    const r = await generarResumen({ evento: "Cumpleaños de Mateo", partes: [{ vtt, desfaseSeg: 0 }] });

    const params = parse.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5", max_tokens: 16000, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"],
      output_config: expect.objectContaining({ effort: "medium", format: expect.objectContaining({ type: "json_schema" }) })
    });
    expect(params.messages[0].content).toContain("Evento: Cumpleaños de Mateo");
    expect(params.messages[0].content).toContain("[00:00:00] Frase número 0");
    expect(r).toMatchObject({
      sinAudio: false, tokensEntrada: 1200, tokensSalida: 300,
      resultado: { resumen: "Fue una tarde alegre.", capitulos: [{ inicioSeg: 0, titulo: "Llegada" }, { inicioSeg: 300, titulo: "La torta" }] }
    });
  });

  it("sin texto (solo música) no gasta una llamada", async () => {
    const r = await generarResumen({ evento: "Misa", partes: [{ vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n[Música]", desfaseSeg: 0 }] });
    expect(r).toEqual({ resultado: null, sinAudio: true, tokensEntrada: 0, tokensSalida: 0 });
    expect(parse).not.toHaveBeenCalled();
  });

  it("si el modelo declina o se corta, falla para reintentar", async () => {
    parse.mockResolvedValue(ok({ stop_reason: "refusal", stop_details: { category: "general_harms" }, parsed_output: null }));
    await expect(generarResumen({ evento: "X", partes: [{ vtt, desfaseSeg: 0 }] })).rejects.toThrow(/declinó/);
    parse.mockResolvedValue(ok({ stop_reason: "max_tokens", parsed_output: null }));
    await expect(generarResumen({ evento: "X", partes: [{ vtt, desfaseSeg: 0 }] })).rejects.toThrow(/incompleta/);
  });
});
