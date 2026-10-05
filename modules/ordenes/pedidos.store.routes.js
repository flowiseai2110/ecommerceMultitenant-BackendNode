import { Router } from "express";
import { z } from "zod";
import config from "../../config/index.js";
import { crearLimitador } from "../../kernel/http/rate-limit.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda, optionalAuth } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PedidosService from "./pedidos.service.js";
import { createPedidoSchema } from "./pedidos.schema.js";

const pedidosService = new PedidosService();

const router = Router();

// Rate limit propio del checkout, más agresivo que el global: crear un pedido
// descuenta stock, así que un bot creando pedidos falsos puede vaciar el
// inventario de una tienda (OWASP OAT-021 Denial of Inventory). Un cliente
// legítimo no crea más de un puñado de pedidos por ventana.
const checkoutLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.checkoutMax,
  code: "TOO_MANY_ORDERS",
  message: "Has creado demasiados pedidos en poco tiempo, intenta más tarde"
});

// ============================================
// POST / - Crear pedido desde el storefront (público)
// Si la tienda se resolvió por subdominio, el pedido SIEMPRE se crea contra
// esa tienda — ignora cualquier tiendaId que el cliente intente enviar.
// ============================================
router.post(
  "/",
  checkoutLimiter,
  // Login opcional: con sesión el pedido queda en "Mis pedidos"; un token
  // inválido o vencido no bloquea la compra, se procesa como invitado.
  optionalAuth,
  scopeBodyToTienda,
  validate({ body: createPedidoSchema }),
  async (req, res, next) => {
    try {
      const data = await pedidosService.create(req.body, { authUserId: req.user?.id ?? null });

      // Fire-and-forget: la respuesta del checkout no espera al email
      pedidosService.notifyNewOrder(data);

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PEDIDO_CREATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /rastrear/:numeroPedido?tiendaId=X[&verificacion=1234] — Seguimiento público
// Dos niveles (modules/ordenes/rastreo.js): sin prueba de identidad solo estado
// y fechas; con sesión del dueño o los últimos 4 dígitos del WhatsApp del
// pedido, el detalle completo. El storefront ya manda el token a /store/pedidos.
// ============================================
const rastrearParamSchema = z.object({
  numeroPedido: z.string().min(1).max(20)
});
const rastrearQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  verificacion: z.string().regex(/^\d{4}$/, "Ingresa los últimos 4 dígitos de tu WhatsApp").optional()
});

const limiteRastreoIp = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.rastreoMax,
  code: "TOO_MANY_REQUESTS",
  message: "Demasiadas consultas de seguimiento, intenta más tarde"
});

// Por pedido y no por IP: así la fuerza bruta sobre los 10.000 códigos no se
// reparte entre muchas IPs. Solo cuenta intentos fallidos. Quien lo dispare
// bloquea 15 min la verificación de ese pedido, no el nivel público ni la sesión.
const limiteVerificacion = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.rastreoVerificacionMax,
  skip: (req) => !req.validatedQuery?.verificacion,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.validatedQuery.tiendaId}:${req.params.numeroPedido.toUpperCase()}`,
  code: "TOO_MANY_REQUESTS",
  message: "Demasiados intentos de verificación para este pedido, intenta en unos minutos"
});

router.get(
  "/rastrear/:numeroPedido",
  limiteRastreoIp,
  optionalAuth,
  validate({ params: rastrearParamSchema, query: rastrearQuerySchema }),
  limiteVerificacion,
  async (req, res, next) => {
    try {
      const { numeroPedido } = req.params;
      const { tiendaId, verificacion } = req.validatedQuery;

      const pedido = await pedidosService.rastrear(tiendaId, numeroPedido, {
        verificacion,
        authUserId: req.user?.id ?? null
      });

      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_FOUND", data: pedido });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
