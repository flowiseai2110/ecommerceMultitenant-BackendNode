import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PedidosService from "../../services/pedidos.service.js";
import { createPedidoSchema } from "../../validators/pedidos.validator.js";

const pedidosService = new PedidosService();

const router = Router();

// Rate limit propio del checkout, más agresivo que el global: crear un pedido
// descuenta stock, así que un bot creando pedidos falsos puede vaciar el
// inventario de una tienda (OWASP OAT-021 Denial of Inventory). Un cliente
// legítimo no crea más de un puñado de pedidos por ventana.
const checkoutLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.checkoutMax,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_ORDERS",
    data: { message: "Has creado demasiados pedidos en poco tiempo, intenta más tarde" }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// POST / - Crear pedido desde el storefront (público)
// Si la tienda se resolvió por subdominio, el pedido SIEMPRE se crea contra
// esa tienda — ignora cualquier tiendaId que el cliente intente enviar
// (evita pedidos cruzados por frontend desactualizado o manipulación).
// ============================================
router.post(
  "/",
  checkoutLimiter,
  scopeBodyToTienda,
  validate({ body: createPedidoSchema }),
  async (req, res, next) => {
    try {
      const data = await pedidosService.create(req.body);

      // Fire-and-forget: la respuesta del checkout no espera al email
      pedidosService.notifyNewOrder(data);

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PEDIDO_CREATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /rastrear/:numeroPedido?tiendaId=X — Seguimiento público de pedido
// ============================================
const rastrearParamSchema = z.object({
  numeroPedido: z.string().min(1).max(20)
});
const rastrearQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido")
});

router.get(
  "/rastrear/:numeroPedido",
  validate({ params: rastrearParamSchema, query: rastrearQuerySchema }),
  async (req, res, next) => {
    try {
      const { numeroPedido } = req.params;
      const { tiendaId } = req.query;

      const pedido = await pedidosService.rastrear(tiendaId, numeroPedido);

      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_FOUND", data: pedido });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
