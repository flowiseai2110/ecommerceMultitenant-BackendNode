import { Router } from "express";
import config from "../../config/index.js";
import { crearLimitador } from "../../kernel/http/rate-limit.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { asistenteQuerySchema, mensajeAsistenteSchema } from "./asistente.schema.js";
import { responderTurno } from "./asistente.service.js";
import { obtenerProgreso } from "./asistente.progreso.js";
import { conConsulta } from "../consumo-ia/consumo-ia.service.js";

const router = Router();

// Cada mensaje es una llamada a un LLM (dinero): límite por usuario autenticado.
const asistenteLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.asistente.rateLimitMax,
  keyGenerator: (req) => req.user.id,
  code: "TOO_MANY_AI_REQUESTS",
  message: "Hiciste muchas preguntas seguidas. Espera unos minutos y seguimos."
});

// El tiendaId efectivo SIEMPRE es req.tiendaId (validado por requireTiendaAccess
// a partir de ?tiendaId=). Cualquier miembro (viewer+) puede usar el asistente.

// GET /progreso - Checklist de primeros pasos (sin LLM, costo cero)
router.get(
  "/progreso",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: asistenteQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await obtenerProgreso(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ASISTENTE_PROGRESO", data });
    } catch (error) {
      next(error);
    }
  }
);

// POST /mensajes - Un turno de conversación con el asistente
router.post(
  "/mensajes",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: asistenteQuerySchema, body: mensajeAsistenteSchema }),
  asistenteLimiter,
  async (req, res, next) => {
    try {
      const { mensaje, historial, rutaActual } = req.body;
      // Cuenta 1 consulta del mes (402 QUOTA_EXCEEDED si ya no quedan).
      const { resultado: turno, consumo } = await conConsulta(req.tiendaId, "asistente", () =>
        responderTurno({ tiendaId: req.tiendaId, rutaActual, mensaje, historial })
      );
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "ASISTENTE_RESPUESTA",
        data: { mensaje: turno.mensaje, acciones: turno.acciones, consumo }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
