/**
 * Servicio del asesor de ventas IA.
 *
 * Aquí — y SOLO aquí — vive el acoplamiento con el proveedor LLM. Si en el futuro
 * se migra a otro modelo (DeepSeek/Qwen/etc.), se cambia este archivo y nada más.
 *
 * Patrón: Messages API + tool-use MANUAL (nuestro propio loop). No usamos Managed
 * Agents ni el tool-runner beta del SDK: queremos control del loop, del scope
 * multi-tenant y de la persistencia.
 *
 * @see modules/agente/arquitectura.md — §2, §3 (modelo), §6 (Fase 1).
 * @see docs/specs/agente-ventas/plan.md — Fase 3 (streaming).
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
import { sumarUso } from "../consumo-ia/consumo-ia.service.js";
import { indicadoresPrecio, contienePrecio } from "./precios.js";
import { calcularEnvioToolDef, ejecutarCalcularEnvio } from "./tools/calcular-envio.js";
import { estadoPedidoToolDef, ejecutarEstadoPedido } from "./tools/estado-pedido.js";
import { ejecutarToolHotel, systemPromptHotel, toolsHotel } from "./perfiles/hotel.js";
import { ejecutarToolTours, systemPromptTours, toolsTours } from "./perfiles/tours.js";
import { ejecutarToolEventos, systemPromptEventos, toolsEventos } from "./perfiles/eventos.js";

/**
 * Perfiles de las verticales de reserva (mini booking). Sin perfil rige el
 * asesor de productos (catálogo, envíos, pedidos).
 */
const PERFILES = {
  hotel: {
    system: systemPromptHotel, tools: toolsHotel, ejecutar: ejecutarToolHotel,
    busqueda: "ver_habitaciones", saludo: "¿Qué habitación estás buscando?"
  },
  tours: {
    system: systemPromptTours, tools: toolsTours, ejecutar: ejecutarToolTours,
    busqueda: "buscar_tours", saludo: "¿Qué tour te gustaría hacer?"
  },
  eventos: {
    system: systemPromptEventos, tools: toolsEventos, ejecutar: ejecutarToolEventos,
    busqueda: "ver_eventos", saludo: "¿A qué evento te gustaría ir?"
  }
};

// Si el texto del modelo trae un monto (inventado: no recibe precios).
const CORRECCION_PRECIO =
  "[Nota del sistema, no del cliente] Tu respuesta mencionó un precio o monto. Reescríbela " +
  "sin ningún precio, monto ni moneda: las tarjetas ya muestran el precio real.";
const MENSAJE_SIN_PRECIO = "Te dejo las opciones abajo; cada tarjeta muestra su precio actualizado.";

// Degradación cuando el modelo no empieza a responder a tiempo (streaming).
const MENSAJE_LENTO_CON_PRODUCTOS = "Te dejo algunas opciones mientras tanto 👇";
const MENSAJE_LENTO_SIN_PRODUCTOS =
  "Estoy tardando más de lo normal. ¿Me lo repites en unos segundos?";

/** El modelo no emitió su primer token dentro de `config.agente.primerTokenMs`. */
class SinPrimerTokenError extends Error {}

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
    "  UN producto y por qué, en una frase de máximo 25 palabras. Sin listas, sin disculpas.",
    "- NUNCA escribas precios, montos ni monedas: no los conoces. Para hablar de precio usa los",
    "  indicadores de la herramienta (tiene_oferta, es_la_mas_economica, dentro_de_presupuesto).",
    "- Nunca pidas datos de tarjeta: el pago se hace solo en el checkout de la tienda.",
    "- Si preguntan por envío o delivery a un lugar, usa calcular_envio. No escribas costos ni",
    "  plazos que la herramienta no devolvió; la interfaz muestra el costo en una tarjeta.",
    "- Si preguntan por su pedido, usa estado_pedido. Nunca inventes estados ni fechas.",
    "- Si la intención no está clara, haz una pregunta corta antes de buscar.",
    "",
    "Ejemplo de respuesta: \"Para correr te recomiendo la Cross Fit Ligera, es la más liviana;",
    "abajo tienes más opciones.\""
  ].join("\n");
}

/**
 * Una llamada al modelo. Sin `emisor`, respuesta completa. Con `emisor`,
 * streaming: cada delta de texto va a `emisor.texto` y, si no llega el primer
 * token a tiempo, se aborta con SinPrimerTokenError.
 * @returns {Promise<import("@anthropic-ai/sdk").Anthropic.Message>}
 */
async function llamarModelo(client, params, emisor) {
  if (!emisor) return client.messages.create(params);

  const stream = client.messages.stream(params);
  let porTimeout = false;
  let timer = setTimeout(() => {
    porTimeout = true;
    stream.abort();
  }, config.agente.primerTokenMs);
  const llegoPrimerToken = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  stream.on("streamEvent", (ev) => {
    if (ev.type === "content_block_start" || ev.type === "content_block_delta") llegoPrimerToken();
  });
  stream.on("text", (delta) => emisor.texto(delta));

  try {
    return await stream.finalMessage();
  } catch (err) {
    if (porTimeout) throw new SinPrimerTokenError();
    throw err;
  } finally {
    llegoPrimerToken();
  }
}

/**
 * Procesa un turno del asesor: corre el loop de tool-use y devuelve el texto del
 * asesor + los productos recomendados (para las tarjetas del chat).
 *
 * @param {object} params
 * @param {string} params.tiendaId - Inyectado server-side. Scope de toda búsqueda.
 * @param {string} [params.tiendaNombre]
 * @param {string} params.mensaje - Mensaje nuevo del cliente.
 * @param {Array<{rol:string,contenido:string}>} [params.historial] - Turnos previos, leídos
 *   de la BD (agente.conversaciones.js). Nunca del body: el cliente podría inventar turnos.
 * @param {string|null} [params.authUserId] - Del JWT (optionalAuth). Solo lo usa estado_pedido;
 *   nunca sale del input del modelo.
 * @param {{ texto:(delta:string)=>void, productos:(productos:Array)=>void, reinicio:()=>void }} [params.emisor]
 *   Solo en streaming: recibe los deltas de texto, las tarjetas en cuanto la tool
 *   termina y el aviso de borrar el texto parcial (preámbulo antes de una tool o
 *   respuesta que se reescribe).
 * @returns {Promise<{ mensaje: string, productos: Array, envio: object|null, pedidos: Array,
 *   sugerencias: string[], uso: object,
 *   senales: { busquedasSinResultados: number, errorHerramienta: boolean } }>}
 */
export async function responderTurno({
  tiendaId, tiendaNombre, tipoNegocio = null, mensaje, historial = [], authUserId = null, emisor = null
}) {
  const client = getClient();

  // Perfil según la vertical (mini booking): un hotel o una agencia no tienen
  // catálogo con stock ni envíos, tienen habitaciones o tours que el negocio
  // confirma. Lo resuelve resolveTienda junto con el tiendaId; sin dato rige
  // el perfil de productos.
  const perfil = PERFILES[tipoNegocio] ?? null;

  const system = perfil ? perfil.system(tiendaNombre) : buildSystemPrompt(tiendaNombre);
  const facetas = perfil ? null : await obtenerFacetas(tiendaId);
  const tools = perfil
    ? perfil.tools
    : [buildBuscarProductosToolDef(facetas), calcularEnvioToolDef, estadoPedidoToolDef];

  // Historial del cliente + mensaje nuevo, en el formato del Messages API.
  const messages = [
    ...historial.map(m => ({ role: m.rol, content: m.contenido })),
    { role: "user", content: mensaje }
  ];

  // Acumula productos devueltos por la tool durante este turno (dedup por id) —
  // es lo que el frontend renderiza como tarjetas.
  const productosPorId = new Map();
  const productos = () => [...productosPorId.values()];

  // Tokens de todas las vueltas: los registra modules/consumo-ia (costo real).
  const uso = { entrada: 0, salida: 0 };
  // Para el contador de fallos de la conversación (pase a persona).
  const senales = { busquedasSinResultados: 0, errorHerramienta: false };
  let corrigioPrecio = false;

  // Lo que devuelven calcular_envio y estado_pedido para el frontend (tarjeta de
  // envío, accesos al seguimiento, botones de distrito).
  const extras = { envio: null, pedidos: [], sugerencias: [] };

  const terminar = (texto) => ({ mensaje: texto, productos: productos(), ...extras, uso, senales });

  /** Ejecuta una tool, SIEMPRE con el tiendaId (y la identidad) del servidor. */
  async function ejecutarHerramienta(bloque) {
    try {
      switch (bloque.name) {
        case "buscar_productos": {
          const resultado = await ejecutarBuscarProductos({ tiendaId, input: bloque.input, facetas });
          if (resultado.productos.length === 0) senales.busquedasSinResultados++;
          for (const p of resultado.productos) productosPorId.set(p.id, p);
          const precioMax = typeof bloque.input?.precioMax === "number" ? bloque.input.precioMax : null;
          const indicadores = indicadoresPrecio(resultado.productos, precioMax);
          // Al modelo solo le mandamos lo que necesita para decidir y redactar.
          // categoria y descripcionCorta le permiten descartar lo que contradice
          // lo pedido (género, "cuero blanco"). imagenUrl/imagenAlt solo las usa
          // el frontend: mandárselas a Claude es pagar tokens sin beneficio.
          // Sin precios: indicadores calculados aquí (precios.js), así no
          // puede equivocarse en un monto.
          return {
            productos: resultado.productos.map(p => ({
              id: p.id,
              nombre: p.nombre,
              categoria: p.categoria,
              colores: p.colores,
              descripcionCorta: p.descripcionCorta,
              ...indicadores.get(p.id),
              disponible: (p.stock ?? 0) > 0 || p.variantesDisponibles.length > 0,
              // Solo si tiene variantes: así puede responder "¿hay M en negro?".
              ...(p.totalVariantes > 0 ? { variantesDisponibles: p.variantesDisponibles } : {})
            }))
          };
        }
        case "calcular_envio": {
          const r = await ejecutarCalcularEnvio({ tiendaId, input: bloque.input, facetas });
          if (r.envio) extras.envio = r.envio;
          if (r.sugerencias) extras.sugerencias = r.sugerencias;
          return r.paraModelo;
        }
        case "estado_pedido": {
          const r = await ejecutarEstadoPedido({ tiendaId, authUserId, input: bloque.input });
          if (r.pedidos) extras.pedidos = r.pedidos;
          return r.paraModelo;
        }
        default: {
          // Solo las tools del perfil de la tienda: un hotel no puede pedir buscar_tours.
          if (!perfil?.tools.some(t => t.name === bloque.name)) return { error: `Herramienta desconocida: ${bloque.name}` };
          const r = await perfil.ejecutar(bloque.name, bloque.input, { tiendaId });
          if (bloque.name === perfil.busqueda && r.tarjetas.length === 0) senales.busquedasSinResultados++;
          for (const t of r.tarjetas) productosPorId.set(t.id, t);
          return r.paraModelo;
        }
      }
    } catch (err) {
      logger.error(`[agente] tool ${bloque.name} falló: ${err.message}`);
      senales.errorHerramienta = true;
      return { error: "ERROR_SERVICIO", mensaje: "No se pudo completar la consulta." };
    }
  }

  try {
    for (let vuelta = 0; vuelta < config.agente.maxToolLoops; vuelta++) {
      let respuesta;
      try {
        respuesta = await llamarModelo(client, {
          model: config.agente.modelo,
          max_tokens: config.agente.maxTokens,
          system,
          tools,
          messages
        }, emisor);
      } catch (err) {
        if (!(err instanceof SinPrimerTokenError)) throw err;
        logger.warn(`[agente] sin primer token en ${config.agente.primerTokenMs} ms, se degrada a tarjetas`);
        return await degradarPorLentitud({ tiendaId, mensaje, facetas, productosPorId, emisor, terminar, perfil });
      }
      sumarUso(uso, respuesta.usage);

      if (respuesta.stop_reason === "tool_use") {
        // El texto previo a la tool ("Déjame buscar…") no es la respuesta: se
        // borra en el chat y llegan las tarjetas.
        emisor?.reinicio();

        // El modelo pidió usar la tool. Ejecutamos cada llamada, SIEMPRE con el
        // tiendaId server-side, y devolvemos los resultados.
        messages.push({ role: "assistant", content: respuesta.content });

        // Las tools no dependen entre sí: en paralelo, una sola vuelta al LLM.
        const bloques = respuesta.content.filter(b => b.type === "tool_use");
        const resultados = await Promise.all(bloques.map(ejecutarHerramienta));
        const toolResults = bloques.map((bloque, i) => ({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: JSON.stringify(resultados[i])
        }));

        // Tarjetas antes que el texto: el cliente ve productos mientras el
        // modelo redacta.
        if (productosPorId.size > 0) emisor?.productos(productos());

        messages.push({ role: "user", content: toolResults });
        continue; // otra vuelta: el modelo ahora redacta con los resultados
      }

      // stop_reason == "end_turn" (u otro terminal): extraer el texto final.
      const texto = respuesta.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();

      // El modelo no recibe precios: un monto en su texto es inventado. Se le
      // pide reescribir una vez; si insiste, plantilla (las tarjetas ya tienen
      // el precio real).
      if (contienePrecio(texto)) {
        emisor?.reinicio();
        if (!corrigioPrecio) {
          corrigioPrecio = true;
          logger.warn("[agente] respuesta con precio inventado, se pide reescribir");
          messages.push({ role: "assistant", content: respuesta.content });
          messages.push({ role: "user", content: CORRECCION_PRECIO });
          continue;
        }
        logger.warn("[agente] respuesta con precio tras reescribir, se usa plantilla");
        return terminar(MENSAJE_SIN_PRECIO);
      }

      return terminar(texto || (perfil ? perfil.saludo : "¿En qué puedo ayudarte con nuestros productos?"));
    }

    // Se agotaron las vueltas de tool-use sin respuesta final: degradar con gracia.
    logger.warn("[agente] se alcanzó maxToolLoops sin end_turn");
    return terminar("Encontré algunas opciones, ¿quieres que te dé más detalles de alguna?");
  } catch (err) {
    // Errores del proveedor LLM (red, rate limit, etc.). La consulta se
    // devuelve en conConsulta (modules/consumo-ia).
    logger.error(`[agente] fallo del proveedor LLM: ${err.message}`);
    throw new InternalError("El asesor no está disponible en este momento. Intenta de nuevo.");
  }
}

/**
 * El modelo no respondió a tiempo: el cliente ve productos igual. Si la tool
 * aún no había corrido, se busca directo con el mensaje como texto libre.
 */
async function degradarPorLentitud({ tiendaId, mensaje, facetas, productosPorId, emisor, terminar, perfil = null }) {
  if (productosPorId.size === 0) {
    try {
      const productos = perfil
        ? (await perfil.ejecutar(perfil.busqueda, {}, { tiendaId })).tarjetas
        : (await ejecutarBuscarProductos({ tiendaId, input: { query: mensaje }, facetas })).productos;
      for (const p of productos) productosPorId.set(p.id, p);
    } catch (err) {
      logger.error(`[agente] búsqueda de respaldo falló: ${err.message}`);
    }
  }
  emisor?.reinicio();
  if (productosPorId.size > 0) emisor?.productos([...productosPorId.values()]);
  return terminar(productosPorId.size > 0 ? MENSAJE_LENTO_CON_PRODUCTOS : MENSAJE_LENTO_SIN_PRODUCTOS);
}
