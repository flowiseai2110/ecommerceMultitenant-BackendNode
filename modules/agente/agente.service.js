/**
 * Servicio del asesor de ventas IA (Fase 1).
 *
 * Aquí — y SOLO aquí — vive el acoplamiento con el proveedor LLM. Si en el futuro
 * se migra a otro modelo (DeepSeek/Qwen/etc.), se cambia este archivo y nada más.
 *
 * Patrón: Messages API + tool-use MANUAL (nuestro propio loop). No usamos Managed
 * Agents ni el tool-runner beta del SDK: queremos control del loop, del scope
 * multi-tenant y de la persistencia.
 *
 * @see modules/agente/arquitectura.md — §2, §3 (modelo), §6 (Fase 1).
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index.js";
import logger from "../../config/logger.js";
import { InternalError } from "../../utils/errors.js";
import {
  buildBuscarProductosToolDef,
  ejecutarBuscarProductos,
  obtenerFacetas
} from "./tools/buscar-productos.js";

// Cliente singleton perezoso: no se instancia hasta el primer uso, para no fallar
// el arranque del server si la API key aún no está configurada.
let _client = null;
function getClient() {
  if (!_client) {
    if (!config.agente.apiKey) {
      throw new InternalError("Asesor IA no configurado (falta AGENTE_IA_API_KEY).");
    }
    _client = new Anthropic({ apiKey: config.agente.apiKey });
  }
  return _client;
}

/**
 * System prompt por tienda. Define el rol de vendedor y los guardrails.
 * NO incluye el catálogo: el modelo solo conoce productos vía la tool.
 * @param {string} tiendaNombre
 * @returns {string}
 */
function buildSystemPrompt(tiendaNombre) {
  const nombre = tiendaNombre || "la tienda";
  return [
    `Eres el asesor de ventas de "${nombre}". Ayudas a encontrar productos y a decidir`,
    "la compra, con trato cercano y honesto (español LATAM).",
    "",
    "Reglas:",
    "- Usa buscar_productos cuando el cliente pregunte por productos, precio o disponibilidad.",
    "- Solo menciona productos que la herramienta devuelva. Si no hay resultados, dilo y sugiere alternativas.",
    "- Si el cliente pide para hombre, mujer, un uso o un color que la tool ofrece como filtro, úsalo.",
    "- Si los colores, el nombre o la descripción de un producto contradicen lo pedido",
    "  (ej: pidió negro y dice \"cuero blanco\"), no lo recomiendes.",
    "- La interfaz ya muestra todas las tarjetas con precio y stock. Tu texto solo recomienda",
    "  UN producto y por qué, en una frase de máximo 25 palabras. Sin listas, sin disculpas,",
    "  sin repetir precios.",
    "- Si la intención no está clara, haz una pregunta corta antes de buscar.",
    "",
    "Ejemplo de respuesta: \"Para correr te recomiendo la Cross Fit Ligera, es la más liviana;",
    "abajo tienes más opciones.\""
  ].join("\n");
}

/**
 * Procesa un turno del asesor: corre el loop de tool-use y devuelve el texto del
 * asesor + los productos recomendados (para las tarjetas del chat).
 *
 * @param {object} params
 * @param {string} params.tiendaId - Inyectado server-side. Scope de toda búsqueda.
 * @param {string} [params.tiendaNombre]
 * @param {string} params.mensaje - Mensaje nuevo del cliente.
 * @param {Array<{rol:string,contenido:string}>} [params.historial] - Turnos previos.
 * @returns {Promise<{ mensaje: string, productos: Array }>}
 */
export async function responderTurno({ tiendaId, tiendaNombre, mensaje, historial = [] }) {
  const client = getClient();

  const system = buildSystemPrompt(tiendaNombre);
  const facetas = await obtenerFacetas(tiendaId);
  const tools = [buildBuscarProductosToolDef(facetas)];

  // Historial del cliente + mensaje nuevo, en el formato del Messages API.
  const messages = [
    ...historial.map(m => ({ role: m.rol, content: m.contenido })),
    { role: "user", content: mensaje }
  ];

  // Acumula productos devueltos por la tool durante este turno (dedup por id) —
  // es lo que el frontend renderiza como tarjetas.
  const productosPorId = new Map();

  try {
    for (let vuelta = 0; vuelta < config.agente.maxToolLoops; vuelta++) {
      const respuesta = await client.messages.create({
        model: config.agente.modelo,
        max_tokens: config.agente.maxTokens,
        system,
        tools,
        messages
      });

      if (respuesta.stop_reason === "tool_use") {
        // El modelo pidió usar la tool. Ejecutamos cada llamada, SIEMPRE con el
        // tiendaId server-side, y devolvemos los resultados.
        messages.push({ role: "assistant", content: respuesta.content });

        const toolResults = [];
        for (const bloque of respuesta.content) {
          if (bloque.type !== "tool_use") continue;

          let resultadoParaElModelo;
          try {
            if (bloque.name === "buscar_productos") {
              const resultado = await ejecutarBuscarProductos({ tiendaId, input: bloque.input, facetas });
              for (const p of resultado.productos) productosPorId.set(p.id, p);
              // Al modelo solo le mandamos lo que necesita para decidir y redactar.
              // categoria y descripcionCorta le permiten descartar lo que contradice
              // lo pedido (género, "cuero blanco"). imagenUrl/imagenAlt solo las usa
              // el frontend: mandárselas a Claude es pagar tokens sin beneficio.
              resultadoParaElModelo = {
                productos: resultado.productos.map(p => ({
                  id: p.id,
                  nombre: p.nombre,
                  categoria: p.categoria,
                  colores: p.colores,
                  descripcionCorta: p.descripcionCorta,
                  precioBase: p.precioBase,
                  precioOferta: p.precioOferta,
                  disponible: (p.stock ?? 0) > 0
                }))
              };
            } else {
              resultadoParaElModelo = { error: `Herramienta desconocida: ${bloque.name}` };
            }
          } catch (err) {
            logger.error(`[agente] tool ${bloque.name} falló: ${err.message}`);
            resultadoParaElModelo = { error: "No se pudo completar la búsqueda." };
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: bloque.id,
            content: JSON.stringify(resultadoParaElModelo)
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue; // otra vuelta: el modelo ahora redacta con los resultados
      }

      // stop_reason == "end_turn" (u otro terminal): extraer el texto final.
      const texto = respuesta.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();

      return {
        mensaje: texto || "¿En qué puedo ayudarte con nuestros productos?",
        productos: [...productosPorId.values()]
      };
    }

    // Se agotaron las vueltas de tool-use sin respuesta final: degradar con gracia.
    logger.warn("[agente] se alcanzó maxToolLoops sin end_turn");
    return {
      mensaje: "Encontré algunas opciones, ¿quieres que te dé más detalles de alguna?",
      productos: [...productosPorId.values()]
    };
  } catch (err) {
    // Errores del proveedor LLM (red, rate limit, etc.). En Fase 2, aquí va el
    // reverso del crédito consumido.
    logger.error(`[agente] fallo del proveedor LLM: ${err.message}`);
    throw new InternalError("El asesor no está disponible en este momento. Intenta de nuevo.");
  }
}
