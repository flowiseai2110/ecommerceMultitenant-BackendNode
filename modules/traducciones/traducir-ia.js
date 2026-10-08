import Anthropic from "@anthropic-ai/sdk";
import config from "../../config/index.js";

/**
 * Traducción con IA del contenido de la tienda, español de Perú → inglés
 * (docs/specs/hospedaje-completo C3). Recibe textos con una clave y devuelve
 * la traducción por clave; los textos sin traducción en la respuesta quedan
 * pendientes para el siguiente intento.
 */

const LOTE = 40;

let _client = null;
function cliente() {
  if (!config.traducciones.apiKey) return null;
  _client ??= new Anthropic({ apiKey: config.traducciones.apiKey });
  return _client;
}

export const iaDisponible = () => Boolean(config.traducciones.apiKey);

const SISTEMA = [
  "You translate the website content of a small hospitality business in Peru (hotel, hostel, tour agency or event venue) from Spanish to English for international travelers.",
  "Translate naturally, the way a native English-speaking hotel website would say it. Keep it as short as the original.",
  "Keep proper names, brand names, street names, districts and local places in their original form (Barranco, Miraflores, Puente de los Suspiros).",
  "Keep prices, numbers, times, emojis and line breaks exactly as they are. Currency stays as S/.",
  "If a text is already in English or is only a name or a number, return it unchanged.",
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

async function traducirLote(textos, contexto) {
  const entrada = Object.entries(textos).map(([clave, texto]) => ({ clave, texto }));
  const respuesta = await cliente().messages.create({
    model: config.traducciones.modelo,
    max_tokens: 16000,
    // Traducir textos cortos no necesita razonar mucho.
    output_config: { effort: "low", format: FORMATO },
    system: SISTEMA,
    messages: [{
      role: "user",
      content: `${contexto ? `Business: ${contexto}\n\n` : ""}Translate the "texto" of each item:\n${JSON.stringify(entrada)}`
    }]
  });
  if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens") return {};
  const bloque = respuesta.content.find(b => b.type === "text");
  if (!bloque) return {};
  const { traducciones } = JSON.parse(bloque.text);
  const validas = new Set(Object.keys(textos));
  return Object.fromEntries(traducciones.filter(t => validas.has(t.clave) && t.texto.trim()).map(t => [t.clave, t.texto]));
}

/**
 * @param {Record<string, string>} textos - clave → texto en español
 * @param {string} [contexto] - nombre y tipo del negocio, para el tono
 * @returns {Promise<Record<string, string>>} clave → texto en inglés
 */
export async function traducirTextos(textos, contexto = "") {
  if (!cliente()) return {};
  const claves = Object.keys(textos);
  const resultado = {};
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = Object.fromEntries(claves.slice(i, i + LOTE).map(k => [k, textos[k]]));
    Object.assign(resultado, await traducirLote(lote, contexto));
  }
  return resultado;
}
