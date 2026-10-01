/**
 * Servicio del asistente del panel admin ("Guía").
 *
 * Mismo patrón que el asesor de ventas (modules/agente): Messages API + tool-use
 * manual, acoplamiento con el proveedor LLM solo en este archivo.
 *
 * Tools:
 * - consultar_progreso_tienda: lectura real (scoped por tiendaId server-side).
 * - ir_a_pantalla / iniciar_tour: NO ejecutan nada en el servidor. Se recolectan
 *   como "acciones" que el frontend muestra como botones; el usuario decide si
 *   las pulsa. Sus inputs son enums cerrados (asistente.catalogo.js).
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index.js";
import logger from "../../config/logger.js";
import { InternalError } from "../../utils/errors.js";
import { RUTAS_VALIDAS, TOURS_VALIDOS } from "./asistente.catalogo.js";
import { buildSystemPrompt, buildContexto } from "./asistente.conocimiento.js";
import { obtenerProgreso } from "./asistente.progreso.js";
import { prisma } from "../../config/prisma.js";
import { sumarUso } from "../consumo-ia/consumo-ia.service.js";

// Máximo de botones de acción por respuesta: más satura el chat en móvil.
const MAX_ACCIONES = 3;

let _client = null;
function getClient() {
  if (!_client) {
    if (!config.asistente.apiKey) {
      throw new InternalError("Asistente IA no configurado (falta AGENTE_IA_API_KEY).");
    }
    _client = new Anthropic({ apiKey: config.asistente.apiKey });
  }
  return _client;
}

const TOOLS = [
  {
    name: "consultar_progreso_tienda",
    description:
      "Devuelve qué pasos de configuración tiene completos y cuáles faltan en la tienda del usuario " +
      "(WhatsApp, logo, banner, categorías, productos, métodos de pago y envío, primer pedido). " +
      "Úsala cuando pregunte qué le falta, por dónde empezar o cómo va su tienda.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ir_a_pantalla",
    description:
      "Muestra al usuario un botón para ir a una pantalla del panel. No navega solo: el usuario lo pulsa.",
    input_schema: {
      type: "object",
      properties: {
        ruta: { type: "string", enum: RUTAS_VALIDAS, description: "Ruta del panel" }
      },
      required: ["ruta"]
    }
  },
  {
    name: "iniciar_tour",
    description:
      "Muestra al usuario un botón para iniciar un tour guiado que resalta en pantalla, paso a paso, " +
      "dónde hacer algo. Ofrécelo cuando expliques una tarea que tenga tour.",
    input_schema: {
      type: "object",
      properties: {
        tourId: { type: "string", enum: TOURS_VALIDOS, description: "Id del tour" }
      },
      required: ["tourId"]
    }
  }
];

/**
 * Ejecuta una tool y devuelve [resultadoParaElModelo, accion|null].
 * Exportada para test.
 */
export async function ejecutarTool(nombre, input, { tiendaId }) {
  switch (nombre) {
    case "consultar_progreso_tienda": {
      const progreso = await obtenerProgreso(tiendaId);
      return [{
        completados: progreso.completados,
        total: progreso.total,
        pasos: progreso.pasos.map(p => ({ titulo: p.titulo, completado: p.completado, tourId: p.tourId }))
      }, null];
    }
    case "ir_a_pantalla":
      if (!RUTAS_VALIDAS.includes(input?.ruta)) return [{ error: "Ruta no válida" }, null];
      return [{ ok: true, nota: "Botón mostrado al usuario" }, { tipo: "navegar", ruta: input.ruta }];
    case "iniciar_tour":
      if (!TOURS_VALIDOS.includes(input?.tourId)) return [{ error: "Tour no válido" }, null];
      return [{ ok: true, nota: "Botón mostrado al usuario" }, { tipo: "tour", tourId: input.tourId }];
    default:
      return [{ error: `Herramienta desconocida: ${nombre}` }, null];
  }
}

const claveAccion = (a) => `${a.tipo}:${a.ruta ?? a.tourId}`;

// Tools que solo producen botones: su resultado no le aporta nada al modelo, así
// que si una vuelta trae solo estas y ya hay texto, no hace falta otra llamada.
const TOOLS_DE_UI = new Set(["ir_a_pantalla", "iniciar_tour"]);

const textoDe = (content) => content
  .filter(b => b.type === "text")
  .map(b => b.text)
  .join("")
  .trim();

/**
 * Procesa un turno del asistente.
 * @param {object} params
 * @param {string} params.tiendaId - Server-side (requireTiendaAccess).
 * @param {string} [params.rutaActual]
 * @param {string} params.mensaje
 * @param {Array<{rol:string,contenido:string}>} [params.historial]
 * @returns {Promise<{ mensaje: string, acciones: Array }>}
 */
export async function responderTurno({ tiendaId, rutaActual, mensaje, historial = [] }) {
  const client = getClient();

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true } });
  const tiendaNombre = tienda?.nombre;

  // Bloque 1 (tools + reglas + manual) es idéntico para todas las tiendas y lleva
  // el breakpoint de caché; bloque 2 (tienda, pantalla) varía y va después.
  // OJO: Haiku 4.5 solo cachea prefijos >= 4096 tokens y hoy el prefijo ronda los
  // 2.7K, así que la caché NO aplica todavía (cache_creation_input_tokens: 0).
  // Empieza a ahorrar sola cuando el manual crezca; verificar con usage.
  const system = [
    { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
    { type: "text", text: buildContexto({ tiendaNombre, rutaActual }) }
  ];

  const messages = [
    ...historial.map(m => ({ role: m.rol, content: m.contenido })),
    { role: "user", content: mensaje }
  ];

  const acciones = new Map();
  // Tokens de todas las vueltas: los registra modules/consumo-ia (costo real).
  const uso = { entrada: 0, salida: 0 };

  try {
    for (let vuelta = 0; vuelta < config.asistente.maxToolLoops; vuelta++) {
      const respuesta = await client.messages.create({
        model: config.asistente.modelo,
        max_tokens: config.asistente.maxTokens,
        system,
        tools: TOOLS,
        messages
      });
      sumarUso(uso, respuesta.usage);

      if (respuesta.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: respuesta.content });

        const toolResults = [];
        for (const bloque of respuesta.content) {
          if (bloque.type !== "tool_use") continue;

          let resultado;
          try {
            const [res, accion] = await ejecutarTool(bloque.name, bloque.input, { tiendaId });
            resultado = res;
            if (accion && acciones.size < MAX_ACCIONES) acciones.set(claveAccion(accion), accion);
          } catch (err) {
            logger.error(`[asistente] tool ${bloque.name} falló: ${err.message}`);
            resultado = { error: "No se pudo completar la consulta." };
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: bloque.id,
            content: JSON.stringify(resultado)
          });
        }

        // Corte temprano: el modelo ya respondió y solo pidió botones. Ahorra
        // la segunda llamada (costo y latencia) en el caso más común.
        const textoParcial = textoDe(respuesta.content);
        const soloUI = respuesta.content
          .filter(b => b.type === "tool_use")
          .every(b => TOOLS_DE_UI.has(b.name));
        if (soloUI && textoParcial) {
          return { mensaje: textoParcial, acciones: [...acciones.values()], uso };
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      if (respuesta.stop_reason === "max_tokens") {
        logger.warn("[asistente] respuesta cortada por max_tokens");
      }
      const texto = textoDe(respuesta.content);

      return {
        mensaje: texto || "¿En qué parte del panel te ayudo?",
        acciones: [...acciones.values()],
        uso
      };
    }

    logger.warn("[asistente] se alcanzó maxToolLoops sin end_turn");
    return {
      mensaje: "Te dejo los accesos directos aquí abajo. ¿Quieres que te explique algo más?",
      acciones: [...acciones.values()],
      uso
    };
  } catch (err) {
    if (err instanceof InternalError) throw err;
    logger.error(`[asistente] fallo del proveedor LLM: ${err.message}`);
    throw new InternalError("El asistente no está disponible en este momento. Intenta de nuevo.");
  }
}
