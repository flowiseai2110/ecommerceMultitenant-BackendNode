import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { NotFoundError } from "../../utils/errors.js";
import PedidosRepository from "../../repositories/pedidos.repository.js";
import PedidosService from "../../services/pedidos.service.js";
import emailService from "../../services/email.service.js";
import { logger } from "../../config/logger.js";
import { createPedidoSchema } from "../../validators/pedidos.validator.js";

const pedidosRepository = new PedidosRepository(prisma.pedidos);
const pedidosService = new PedidosService(pedidosRepository);

const router = Router();

/**
 * Notifica por email al dueño de la tienda que entró un pedido nuevo.
 * Se consulta la tienda aquí (y no vía req.tienda) porque resolveTienda
 * no la puebla en desarrollo local sin subdominio, y su caché no incluye
 * los datos de contacto. Cualquier fallo solo se loggea: la notificación
 * nunca debe invalidar un pedido ya creado.
 */
async function notifyNewOrder(pedido) {
  try {
    const tienda = await prisma.tiendas.findUnique({
      where: { id: pedido.tiendaId },
      select: { nombre: true, email: true, logoUrl: true, moneda: true }
    });
    if (tienda) await emailService.sendNewOrderEmail(pedido, tienda);
  } catch (error) {
    logger.error(`❌ No se pudo notificar por email el pedido ${pedido.numeroPedido}:`, error);
  }
}

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
      notifyNewOrder(data);

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

      const pedido = await prisma.pedidos.findFirst({
        where: { tiendaId, numeroPedido },
        select: {
          id: true,
          numeroPedido: true,
          estado: true,
          estadoPago: true,
          subtotal: true,
          descuentoMonto: true,
          costoEnvio: true,
          total: true,
          codigoCupon: true,
          metodoPago: true,
          metodoEnvio: true,
          direccionEnvio: true,
          notas: true,
          fechaConfirmado: true,
          fechaEntregado: true,
          fechaRegistro: true,
          cliente: {
            select: { nombre: true }
          },
          detalles: {
            select: {
              id: true,
              productoNombre: true,
              varianteNombre: true,
              cantidad: true,
              precioUnitario: true,
              descuento: true,
              total: true
            }
          },
          historialEstados: {
            select: { estado: true, notas: true, fechaRegistro: true },
            orderBy: { fechaRegistro: "asc" }
          }
        }
      });

      if (!pedido) throw new NotFoundError("Pedido");

      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_FOUND", data: pedido });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
