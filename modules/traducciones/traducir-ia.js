import Anthropic from "@anthropic-ai/sdk";
import config from "../../config/index.js";
import { sumarUso } from "../consumo-ia/consumo-ia.service.js";

/**
 * Traducción con IA del contenido de la tienda, del idioma base al idioma que
 * elija el dueño (docs/specs/idiomas D3). Recibe textos con una clave y
 * devuelve la traducción por clave; los textos sin traducción en la respuesta
 * quedan pendientes para el siguiente intento.
 */

const LOTE = 40;

let _client = null;
function cliente() {
  if (!config.traducciones.apiKey) return null;
  _client ??= new Anthropic({ apiKey: config.traducciones.apiKey });
  return _client;
}

export const iaDisponible = () => Boolean(config.traducciones.apiKey);

const sistema = (origen, destino) => [
  `You translate the website content of a small business in Peru from ${origen.nombre} (language code "${origen.codigo}") to ${destino.nombre} (language code "${destino.codigo}") for the people who will buy from it.`,
  `Translate naturally, the way a native ${destino.nombre} speaker would say it on a website. Keep it as short as the original. If the language has an official alphabet, use it.`,
  "Keep proper names, brand names, street names, districts and local places in their original form (Barranco, Miraflores, Puente de los Suspiros).",
  "Keep prices, numbers, times, emojis and line breaks exactly as they are. Currency stays as S/.",
  // Descripciones, políticas y contrato llevan Markdown liviano (FrontendStore shared/utils/texto-rico.ts).
  "Keep Markdown formatting exactly as it is: **bold**, *italic*, list markers (\"- \", \"1. \") and links [text](url). Translate the text, never the URL.",
  "Keep placeholders in curly braces exactly as they are, untranslated (for example {n}, {nombre}, {Negocio}): the website fills them in.",
  "If a text is only a name or a number, return it unchanged.",
  "Return one translation for every key you receive, with the same key."
].join(" ");

const FORMATO = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      traducciones: {
        type: "array",
        items: {
          type: "object",
          properties: { clave: { type: "string" }, texto: { type: "string" } },
          required: ["clave", "texto"],
          additionalProperties: false
        }
      }
    },
    required: ["traducciones"],
    additionalProperties: false
  }
};

async function traducirLote(textos, origen, destino, contexto, uso) {
  const entrada = Object.entries(textos).map(([clave, texto]) => ({ clave, texto }));
  const respuesta = await cliente().messages.create({
    model: config.traducciones.modelo,
    max_tokens: 16000,
    // Traducir textos cortos no necesita razonar mucho.
    output_config: { effort: "low", format: FORMATO },
    system: sistema(origen, destino),
    messages: [{
      role: "user",
      content: `${contexto ? `Business: ${contexto}\n\n` : ""}Translate the "texto" of each item:\n${JSON.stringify(entrada)}`
    }]
  });
  // Los tokens se cobran aunque la respuesta no sirva (consumo-ia: costo real por tienda).
  sumarUso(uso, respuesta.usage);
  if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens") return {};
  const bloque = respuesta.content.find(b => b.type === "text");
  if (!bloque) return {};
  const { traducciones } = JSON.parse(bloque.text);
  const validas = new Set(Object.keys(textos));
  return Object.fromEntries(traducciones.filter(t => validas.has(t.clave) && t.texto.trim()).map(t => [t.clave, t.texto]));
}

/**
 * @param {Record<string, string>} textos - clave → texto en el idioma base
 * @param {{ origen: import("../idiomas/idioma.js").Idioma, destino: import("../idiomas/idioma.js").Idioma, contexto?: string }} opciones
 *   origen: el idioma base; destino: al que se traduce; contexto: nombre y tipo del negocio, para el tono
 * @returns {Promise<{ traducciones: Record<string, string>, uso: { entrada: number, salida: number } }>}
 *   clave → texto traducido, y los tokens usados (para consumo-ia)
 */
export async function traducirTextos(textos, { origen, destino, contexto = "" }) {
  const uso = { entrada: 0, salida: 0 };
  if (!cliente()) return { traducciones: {}, uso };
  const claves = Object.keys(textos);
  const traducciones = {};
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = Object.fromEntries(claves.slice(i, i + LOTE).map(k => [k, textos[k]]));
    Object.assign(traducciones, await traducirLote(lote, origen, destino, contexto, uso));
  }
  return { traducciones, uso };
}
