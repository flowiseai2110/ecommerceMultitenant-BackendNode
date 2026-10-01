/**
 * Controller del asesor de ventas IA (Fase 1).
 * Recibe la request, delega en el servicio y devuelve { mensaje, productos }.
 *
 * @see modules/agente/arquitectura.md — §6 (Fase 1).
 */

import { apiResponse } from "../../utils/apiResponse.js";
import { QuotaExceededError } from "../../utils/errors.js";
import { responderTurno } from "./agente.service.js";
import { serializeTurnoAgente } from "./agente.serializer.js";
import { conConsulta } from "../consumo-ia/consumo-ia.service.js";

/**
 * POST /store/agente/mensajes
 * `req.tiendaId` / `req.tienda` los pone `resolveTienda` (server-side).
 * `req.body` ya viene validado por el schema Zod.
 */
export async function responder(req, res, next) {
  try {
    const { mensaje, historial } = req.body;

    // Cuenta 1 consulta del mes de la tienda. El visitante no debe ver el
    // consumo de la tienda: si se agotó, recibe un 402 sin cifras.
    const { resultado: turno } = await conConsulta(req.tiendaId, "asesor", () =>
      responderTurno({
        tiendaId: req.tiendaId,
        tiendaNombre: req.tienda?.nombre,
        mensaje,
        historial
      })
    );

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
