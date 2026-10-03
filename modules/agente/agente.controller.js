/**
 * Controller del asesor de ventas IA.
 * Recibe la request, arma el historial desde la BD, resuelve con plantilla lo
 * que no necesita LLM y, si no, delega en el servicio. Devuelve
 * { mensaje, productos, sugerencias }.
 *
 * @see modules/agente/arquitectura.md — §6.
 * @see docs/specs/agente-ventas/spec.md — R1, R2, R5.
 */

import config from "../../config/index.js";
import logger from "../../config/logger.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { QuotaExceededError } from "../../utils/errors.js";
import { responderTurno } from "./agente.service.js";
import { serializeTurnoAgente } from "./agente.serializer.js";
import { conConsulta } from "../consumo-ia/consumo-ia.service.js";
import { obtenerConversacion, cargarHistorial, guardarTurno } from "./agente.conversaciones.js";
import { clasificarMensaje, textoPlantilla, PLANTILLA } from "./filtros.js";
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
 * POST /store/agente/mensajes
 * `req.tiendaId` / `req.tienda` los pone `resolveTienda` (server-side).
 * `req.body` ya viene validado por el schema Zod.
 */
export async function responder(req, res, next) {
  try {
    const { sessionToken } = req.body;
    const tiendaId = req.tiendaId;
    const inicio = new Date();

    const conversacion = await obtenerConversacion(tiendaId, sessionToken, inicio);

    if (conversacion.turnos >= config.agente.maxTurnos) {
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "AGENTE_LIMITE_TURNOS",
        data: serializeTurnoAgente({ mensaje: MENSAJE_LIMITE_TURNOS })
      });
    }

    // `mensaje` ya viene con los datos de tarjeta enmascarados: es lo que se
    // guarda y lo que ve el LLM.
    const { texto: mensaje, plantilla } = clasificarMensaje(req.body.mensaje);

    const guardar = (respuesta) => guardarTurno({
      tiendaId,
      conversacionId: conversacion.id,
      mensaje,
      respuesta,
      inicio
    }).catch(err => logger.error(`[agente] no se pudo guardar el turno: ${err.message}`));

    // Capas 1 y 2: plantilla sin LLM y sin gastar consulta del plan.
    if (plantilla) {
      const respuesta = textoPlantilla(plantilla, { tiendaNombre: req.tienda?.nombre });
      const sugerencias = plantilla === PLANTILLA.SALUDO ? await sugerenciasDeCategorias(tiendaId) : [];
      await guardar(respuesta);
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "AGENTE_RESPUESTA",
        data: serializeTurnoAgente({ mensaje: respuesta, sugerencias })
      });
    }

    const historial = await cargarHistorial(tiendaId, conversacion.id);

    // Cuenta 1 consulta del mes de la tienda. El visitante no debe ver el
    // consumo de la tienda: si se agotó, recibe un 402 sin cifras.
    const { resultado: turno } = await conConsulta(tiendaId, "asesor", () =>
      responderTurno({
        tiendaId,
        tiendaNombre: req.tienda?.nombre,
        mensaje,
        historial
      })
    );

    // Solo llega aquí si el LLM respondió: un fallo no guarda medio turno. Si
    // falla el guardado, el cliente igual recibe su respuesta (ya se cobró);
    // solo pierde ese turno como contexto.
    await guardar(turno.mensaje);

    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "AGENTE_RESPUESTA",
      data: serializeTurnoAgente(turno)
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return next(new QuotaExceededError("El asesor no está disponible por ahora."));
    }
    next(error);
  }
}
