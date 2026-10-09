import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import config from "../../config/index.js";

/**
 * Resumen con IA de la grabación de un evento (Premium, R8.3): a partir de los
 * subtítulos automáticos en español (WebVTT de Cloudflare Stream) genera un
 * resumen, los capítulos y los momentos clave, con su segundo de inicio.
 *
 * Una sola llamada a Claude con salida estructurada (output_config.format +
 * Zod): la respuesta llega ya validada. Con fallbacks "default", si el modelo
 * declina la petición, la API la reintenta con otro modelo en la misma llamada.
 */

/** Lo que devuelve el modelo (y se guarda en evento_transmisiones.resumen). */
export const ResumenSchema = z.object({
  resumen: z.string(),
  capitulos: z.array(z.object({ inicioSeg: z.number(), titulo: z.string() })),
  momentos: z.array(z.object({ inicioSeg: z.number(), descripcion: z.string() }))
});

let cliente = null;
function anthropic() {
  if (!config.transmisiones.ia.apiKey) throw new Error("TRANSMISIONES_IA_API_KEY (o AGENTE_IA_API_KEY) no está configurada");
  cliente ??= new Anthropic({ apiKey: config.transmisiones.ia.apiKey });
  return cliente;
}

const aSegundos = (hms) => {
  const [h, m, s] = hms.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};
const aReloj = (seg) => {
  const s = Math.max(0, Math.floor(seg));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
};

/**
 * WebVTT → líneas "[hh:mm:ss] texto", con el desfase de la parte (las partes
 * de una transmisión se encadenan). Une las frases repetidas seguidas.
 */
export function vttATexto(vtt, desfaseSeg = 0) {
  const lineas = [];
  let ultimo = "";
  for (const bloque of String(vtt).replace(/\r/g, "").split(/\n\n+/)) {
    const filas = bloque.split("\n");
    const i = filas.findIndex(f => f.includes("-->"));
    if (i < 0) continue;
    const inicio = filas[i].match(/(\d{2}:)?\d{2}:\d{2}\.\d{3}/)?.[0];
    if (!inicio) continue;
    const texto = filas.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!texto || texto === ultimo) continue;
    ultimo = texto;
    const hms = inicio.split(":").length === 2 ? `00:${inicio}` : inicio;
    lineas.push(`[${aReloj(aSegundos(hms) + desfaseSeg)}] ${texto}`);
  }
  return lineas;
}

const SISTEMA = [
  "Resumes la grabación de un evento familiar o social (cumpleaños, boda, bautizo, quinceañero, promoción) a partir de su transcripción automática.",
  "La transcripción viene de subtítulos automáticos: puede tener errores, música o ruido. No inventes nombres, hechos ni frases que no estén en el texto.",
  "Escribe en español claro y cálido, para la familia que no pudo estar.",
  "- resumen: 1 o 2 párrafos cortos sobre lo que pasó.",
  "- capitulos: de 3 a 10 partes del evento en orden, cada una con el segundo en que empieza (inicioSeg, tomado de las marcas [hh:mm:ss]) y un título corto.",
  "- momentos: de 3 a 8 momentos clave (la torta, el vals, un discurso, un brindis), con su segundo de inicio y una frase que lo describa.",
  "Si la transcripción casi no tiene palabras (solo música o ruido), dilo en el resumen y deja capitulos y momentos con lo poco que se pueda ubicar."
].join("\n");

/**
 * @param {{ evento: string, partes: { vtt: string, desfaseSeg: number }[] }} datos
 * @returns {Promise<{ resultado: z.infer<typeof ResumenSchema> | null, sinAudio: boolean, tokensEntrada: number, tokensSalida: number }>}
 */
export async function generarResumen({ evento, partes }) {
  const lineas = partes.flatMap(p => vttATexto(p.vtt, p.desfaseSeg));
  // Sin texto que resumir (solo música o sin audio): no se gasta una llamada.
  if (lineas.length < 5) return { resultado: null, sinAudio: true, tokensEntrada: 0, tokensSalida: 0 };

  const respuesta = await anthropic().beta.messages.parse({
    model: config.transmisiones.ia.modelo,
    max_tokens: 16000,
    system: SISTEMA,
    output_config: { effort: config.transmisiones.ia.effort, format: betaZodOutputFormat(ResumenSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{
      role: "user",
      content: `Evento: ${evento}\n\nTranscripción (cada línea empieza con su hora dentro de la grabación):\n\n${lineas.join("\n")}`
    }]
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo declinó resumir (${respuesta.stop_details?.category ?? "sin categoría"})`);
  }
  if (respuesta.stop_reason === "max_tokens" || !respuesta.parsed_output) {
    throw new Error(`Respuesta incompleta del modelo (stop_reason: ${respuesta.stop_reason})`);
  }
  const r = respuesta.parsed_output;
  const orden = (a, b) => a.inicioSeg - b.inicioSeg;
  return {
    resultado: {
      resumen: r.resumen.trim(),
      capitulos: r.capitulos.map(c => ({ inicioSeg: Math.max(0, Math.round(c.inicioSeg)), titulo: c.titulo.trim() })).sort(orden),
      momentos: r.momentos.map(m => ({ inicioSeg: Math.max(0, Math.round(m.inicioSeg)), descripcion: m.descripcion.trim() })).sort(orden)
    },
    sinAudio: false,
    tokensEntrada: respuesta.usage.input_tokens ?? 0,
    tokensSalida: respuesta.usage.output_tokens ?? 0
  };
}

export { aReloj };
