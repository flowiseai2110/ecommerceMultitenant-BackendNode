/**
 * Controller del asesor de ventas IA.
 * Recibe la request, arma el historial desde la BD, resuelve con plantilla lo
 * que no necesita LLM y, si no, delega en el servicio. Dos salidas con la misma
 * lógica (`atenderMensaje`): JSON completo y streaming por SSE.
 *
 * @see modules/agente/arquitectura.md — §6.
 * @see docs/specs/agente-ventas/spec.md — R1, R2, R5, R7, R8.
 */

import config from "../../config/index.js";
import logger from "../../config/logger.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { QuotaExceededError } from "../../utils/errors.js";
import { responderTurno } from "./agente.service.js";
import { serializeTurnoAgente, serializeProductoCardChat } from "./agente.serializer.js";
import { conConsulta } from "../consumo-ia/consumo-ia.service.js";
import {
  obtenerConversacion,
  obtenerConversacionActiva,
  cargarHistorial,
  listarMensajes,
  guardarTurno
} from "./agente.conversaciones.js";
import { clasificarMensaje, textoPlantilla, PLANTILLA, PLANTILLAS_FALLO } from "./filtros.js";
import { obtenerFacetas } from "./tools/buscar-productos.js";

// Respuesta al llegar al tope de turnos: sin LLM y sin gastar consulta.
const MENSAJE_LIMITE_TURNOS =
  "Ya conversamos bastante por aquí 🙂 Para seguir, escríbenos por WhatsApp " +
  "o sigue explorando la tienda.";

// Botones de categoría que acompañan al saludo.
const MAX_SUGERENCIAS = 4;

/** Categorías principales de la tienda, como botones de respuesta rápida. */
async function sugerenciasDeCategorias(tiendaId) {
  try {
    const { categorias } = await obtenerFacetas(tiendaId);
    return categorias.filter(c => !c.categoriaPadreId).slice(0, MAX_SUGERENCIAS).map(c => c.nombre);
  } catch (err) {
    // Sin botones el saludo sigue funcionando.
    logger.warn(`[agente] no se pudieron cargar categorías para sugerencias: ${err.message}`);
    return [];
  }
}

/**
 * Cómo cambia el contador de fallos con un turno del LLM: sumar si buscó y no
 * encontró nada o falló la herramienta; reiniciar si mostró productos; si solo
 * conversó (ej. una pregunta para aclarar), no cambia.
 */
function falloDelTurno(turno) {
  const { busquedasSinResultados, errorHerramienta } = turno.senales ?? {};
  if (errorHerramienta || (busquedasSinResultados > 0 && turno.productos.length === 0)) return "sumar";
  if (turno.productos.length > 0) return "reiniciar";
  return null;
}

/**
 * Atiende un mensaje del storefront. Común a la respuesta JSON y a la SSE.
 * @param {import("express").Request} req - Ya pasó por resolveTienda y validate.
 * @param {object|null} emisor - Callbacks de streaming (ver responderTurno), o null.
 * @returns {Promise<{ code: string, data: object }>}
 */
async function atenderMensaje(req, emisor = null) {
  const { sessionToken } = req.body;
  const tiendaId = req.tiendaId;
  const conWhatsapp = Boolean(req.tienda?.whatsappNumero);
  const inicio = new Date();

  const conversacion = await obtenerConversacion(tiendaId, sessionToken, inicio);

  if (conversacion.turnos >= config.agente.maxTurnos) {
    return {
      code: "AGENTE_LIMITE_TURNOS",
      data: serializeTurnoAgente({ mensaje: MENSAJE_LIMITE_TURNOS, ofrecerPersona: conWhatsapp })
    };
  }

  // `mensaje` ya viene con los datos de tarjeta enmascarados: es lo que se
  // guarda y lo que ve el LLM.
  const { texto: mensaje, plantilla } = clasificarMensaje(req.body.mensaje);

  const cerrarTurno = async (respuesta, fallo) => {
    await guardarTurno({ tiendaId, conversacionId: conversacion.id, mensaje, respuesta, inicio, fallo })
      .catch(err => logger.error(`[agente] no se pudo guardar el turno: ${err.message}`));
    const fallos = fallo === "sumar" ? conversacion.fallos + 1 : fallo === "reiniciar" ? 0 : conversacion.fallos;
    return conWhatsapp && fallo === "sumar" && fallos >= config.agente.maxFallos;
  };

  // Capas 1 y 2: plantilla sin LLM y sin gastar consulta del plan.
  if (plantilla) {
    const respuesta = textoPlantilla(plantilla, { tiendaNombre: req.tienda?.nombre, conWhatsapp });
    const sugerencias = plantilla === PLANTILLA.SALUDO ? await sugerenciasDeCategorias(tiendaId) : [];
    const porFallos = await cerrarTurno(respuesta, PLANTILLAS_FALLO.has(plantilla) ? "sumar" : null);
    const ofrecerPersona = porFallos || (plantilla === PLANTILLA.PERSONA && conWhatsapp);
    return {
      code: "AGENTE_RESPUESTA",
      data: serializeTurnoAgente({ mensaje: respuesta, sugerencias, ofrecerPersona })
    };
  }

  const historial = await cargarHistorial(tiendaId, conversacion.id);

  // Cuenta 1 consulta del mes de la tienda. El visitante no debe ver el
  // consumo de la tienda: si se agotó, recibe un 402 sin cifras.
  const { resultado: turno } = await conConsulta(tiendaId, "asesor", () =>
    responderTurno({
      tiendaId,
      tiendaNombre: req.tienda?.nombre,
      mensaje,
      historial,
      // Del JWT (optionalAuth), nunca del body ni del modelo: estado_pedido
      // solo ve los pedidos de quien inició sesión.
      authUserId: req.user?.id ?? null,
      emisor
    })
  );

  // Solo llega aquí si el LLM respondió: un fallo no guarda medio turno. Si
  // falla el guardado, el cliente igual recibe su respuesta (ya se cobró);
  // solo pierde ese turno como contexto.
  const ofrecerPersona = await cerrarTurno(turno.mensaje, falloDelTurno(turno));

  return {
    code: "AGENTE_RESPUESTA",
    data: serializeTurnoAgente({ ...turno, ofrecerPersona })
  };
}

/** Quien ve el chat no debe ver el consumo de la tienda: 402 sin cifras. */
function errorParaElVisitante(error) {
  return error instanceof QuotaExceededError
    ? new QuotaExceededError("El asesor no está disponible por ahora.")
    : error;
}

/**
 * POST /store/agente/mensajes — respuesta completa en JSON.
 * `req.tiendaId` / `req.tienda` los pone `resolveTienda` (server-side).
 */
export async function responder(req, res, next) {
  try {
    const { code, data } = await atenderMensaje(req);
    return apiResponse(res, { status: 200, type: "SUCCESS", code, data });
  } catch (error) {
    next(errorParaElVisitante(error));
  }
}

/**
 * POST /store/agente/mensajes/stream — misma lógica, por Server-Sent Events.
 *
 * Eventos: `texto` {delta}, `productos` {productos}, `reinicio` {} (borrar el
 * texto parcial), `fin` {code, mensaje, productos, sugerencias, ofrecerPersona}
 * — fuente de verdad: el frontend reemplaza lo mostrado por esto —, y `error`
 * {status, code, message}. Los errores de validación y de rate limit llegan
 * antes, como JSON normal.
 */
export async function responderStream(req, res) {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform: compression() (global en server.js) no lo acumula en buffer.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Nginx y proxies compatibles: no bufferizar.
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();

  const enviar = (evento, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  try {
    const { code, data } = await atenderMensaje(req, {
      texto: (delta) => enviar("texto", { delta }),
      productos: (productos) => enviar("productos", { productos: productos.map(serializeProductoCardChat) }),
      reinicio: () => enviar("reinicio", {})
    });
    enviar("fin", { code, ...data });
  } catch (error) {
    const err = errorParaElVisitante(error);
    const operacional = err.isOperational === true;
    if (!operacional) logger.error(`[agente] error en stream: ${err.message}`);
    enviar("error", {
      status: err.statusCode || 500,
      code: err.code || "INTERNAL_ERROR",
      message: operacional ? err.message : "El asesor no está disponible en este momento. Intenta de nuevo."
    });
  } finally {
    res.end();
  }
}

/**
 * GET /store/agente/conversacion?sessionToken=… — mensajes de la conversación
 * activa, para volver a pintarlos al reabrir el chat. No crea conversación.
 */
export async function recuperarConversacion(req, res, next) {
  try {
    const { sessionToken } = req.validatedQuery;
    const conversacion = await obtenerConversacionActiva(req.tiendaId, sessionToken);
    const mensajes = conversacion ? await listarMensajes(req.tiendaId, conversacion.id) : [];
    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "AGENTE_CONVERSACION",
      data: { mensajes }
    });
  } catch (error) {
    next(error);
  }
}
