import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
  authMiddleware,
  optionalAuth,
  scopeBodyToTienda,
  scopeQueryToTienda
} from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../utils/errors.js";
import { verificarTokenResena } from "./resenas.token.js";
import { guardarResena, listarResenasDestacadas, listarResenasProducto, listarResenables } from "./resenas.service.js";
import {
  crearResenaSchema,
  destacadasQuerySchema,
  listarProductoQuerySchema,
  productoParamSchema,
  tiendaQuerySchema,
  tokenParamSchema
} from "./resenas.schema.js";

const router = Router();

// Anti-spam de escritura, aparte del limiter global.
const resenaLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.resenas.rateLimitMax,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_REVIEWS",
    data: { message: "Enviaste demasiadas reseñas en poco tiempo, intenta más tarde" }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Resuelve el token del link de WhatsApp y comprueba que sea de la tienda del
 * request (un link de la tienda A no sirve en el subdominio de la tienda B).
 */
async function tokenDeTienda(token, tiendaIdEsperado) {
  const datos = await verificarTokenResena(token);
  if (tiendaIdEsperado && datos.tiendaId !== tiendaIdEsperado) {
    throw new NotFoundError("Pedido");
  }
  return datos;
}

// ============================================
// GET /producto/:productoId?tiendaId=X — Reseñas aprobadas + resumen (público)
// ============================================
router.get(
  "/producto/:productoId",
  validate({ params: productoParamSchema, query: listarProductoQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId, page, limit } = req.validatedQuery || req.query;
      const { data, meta, resumen } = await listarResenasProducto(tiendaId, req.params.productoId, { page, limit });

      // Caché corta como el catálogo: una reseña recién aprobada tarda ≤1 min en verse.
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
      return apiResponse(res, {
        status: 200, type: "SUCCESS", code: "RESENAS_PRODUCTO", data, meta: { ...meta, resumen }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /destacadas?tiendaId=X — Testimonios reales para el home (público)
// ============================================
router.get(
  "/destacadas",
  validate({ query: destacadasQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId, limit } = req.validatedQuery || req.query;
      const data = await listarResenasDestacadas(tiendaId, limit);
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=150");
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENAS_DESTACADAS", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /mis-compras?tiendaId=X — Productos que el comprador logueado puede calificar
// ============================================
router.get(
  "/mis-compras",
  authMiddleware,
  validate({ query: tiendaQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId } = req.validatedQuery || req.query;
      const data = await listarResenables(tiendaId, { authUserId: req.user.id });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENAS_MIS_COMPRAS", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /enlace/:token — Productos del pedido del link de WhatsApp (sin login)
// ============================================
router.get(
  "/enlace/:token",
  validate({ params: tokenParamSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, pedidoId } = await tokenDeTienda(req.params.token, req.tiendaId);
      const pedidos = await listarResenables(tiendaId, { pedidoId });
      return apiResponse(res, {
        status: 200, type: "SUCCESS", code: "RESENAS_ENLACE", data: { tiendaId, pedido: pedidos[0] ?? null }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST / — Crear o editar una reseña
// Con sesión: { pedidoId } y el pedido debe ser de la cuenta.
// Sin sesión: { token } del link de WhatsApp (el pedido sale del token).
// ============================================
router.post(
  "/",
  resenaLimiter,
  optionalAuth,
  scopeBodyToTienda,
  validate({ body: crearResenaSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, productoId, estrellas, comentario, token } = req.body;
      let { pedidoId } = req.body;
      const porToken = !!token;

      if (porToken) {
        const datos = await tokenDeTienda(token, tiendaId);
        // El pedido lo dicta el token, nunca el body.
        if (pedidoId && pedidoId !== datos.pedidoId) {
          throw new ForbiddenError("El enlace no corresponde a este pedido");
        }
        pedidoId = datos.pedidoId;
      } else if (!req.user) {
        throw new UnauthorizedError("Inicia sesión o usa el enlace que te envió la tienda");
      }

      const data = await guardarResena({
        tiendaId,
        pedidoId,
        productoId,
        estrellas,
        comentario,
        authUserId: req.user?.id ?? null,
        porToken
      });

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "RESENA_GUARDADA", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
