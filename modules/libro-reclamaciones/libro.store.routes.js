import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { logger } from "../../config/logger.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { optionalAuth, scopeBodyToTienda, scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { NotFoundError } from "../../utils/errors.js";
import { firmarTokenHoja, verificarTokenHoja } from "./libro.token.js";
import { notificarRegistro, obtenerHojaPublica, obtenerProveedor, registrarHoja } from "./libro.service.js";
import { serializeHojaStore } from "./libro.serializer.js";
import { crearHojaSchema, tiendaQuerySchema, tokenParamSchema } from "./libro.schema.js";

const router = Router();

// Anti-spam de escritura, aparte del limiter global. Sin captcha a propósito:
// el reglamento no permite poner barreras para reclamar (spec R3.5).
const libroLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.libro.rateLimitMax,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_CLAIMS",
    data: { message: "Registraste varias hojas en poco tiempo. Espera unos minutos e intenta de nuevo." }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// GET /proveedor?tiendaId=X — Cabecera del libro (razón social, RUC, dirección)
// ============================================
router.get(
  "/proveedor",
  validate({ query: tiendaQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId } = req.validatedQuery || req.query;
      const data = await obtenerProveedor(tiendaId);
      res.set("Cache-Control", "public, max-age=300");
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_PROVEEDOR", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST / — Registrar una hoja de reclamación (sin login; con sesión se enlaza a la cuenta)
// ============================================
router.post(
  "/",
  libroLimiter,
  optionalAuth,
  scopeBodyToTienda,
  validate({ body: crearHojaSchema }),
  async (req, res, next) => {
    try {
      // Honeypot: una persona nunca llena este campo. Al bot se le responde
      // como si se hubiera registrado, para que no aprenda a evitarlo.
      if (req.body.sitioWeb) {
        logger.warn(`🪤 Libro de Reclamaciones: honeypot activado en la tienda ${req.body.tiendaId}`);
        return apiResponse(res, {
          status: 201, type: "SUCCESS", code: "LIBRO_HOJA_REGISTRADA", data: { numero: null, token: null }
        });
      }

      const { hoja, tienda } = await registrarHoja(req.body, { authUserId: req.user?.id ?? null, ip: req.ip });
      const token = await firmarTokenHoja({ hojaId: hoja.id, tiendaId: hoja.tiendaId });

      // Fire-and-forget: la constancia en pantalla no espera a los correos.
      notificarRegistro(hoja, tienda, token);

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "LIBRO_HOJA_REGISTRADA",
        data: { numero: hoja.numero, token, hoja: serializeHojaStore(hoja) }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /hoja/:token — Constancia (y respuesta, si ya existe)
// ============================================
router.get(
  "/hoja/:token",
  validate({ params: tokenParamSchema }),
  async (req, res, next) => {
    try {
      const { hojaId, tiendaId } = await verificarTokenHoja(req.params.token);
      // Un enlace de la tienda A no sirve en el subdominio de la tienda B (R8.3).
      if (req.tiendaId && req.tiendaId !== tiendaId) {
        throw new NotFoundError("Hoja de reclamación", "Hoja de reclamación no encontrada");
      }
      const data = await obtenerHojaPublica(tiendaId, hojaId);
      res.set("Cache-Control", "private, no-store");
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_HOJA", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
