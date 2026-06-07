import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { NotFoundError } from "../../utils/errors.js";
import PedidosRepository from "../../repositories/pedidos.repository.js";
import PedidosService from "../../services/pedidos.service.js";
import { createPedidoSchema } from "../../validators/pedidos.validator.js";

const pedidosRepository = new PedidosRepository(prisma.pedidos);
const pedidosService = new PedidosService(pedidosRepository);

const router = Router();

// ============================================
// POST / - Crear pedido desde el storefront (público)
// Si la tienda se resolvió por subdominio, el pedido SIEMPRE se crea contra
// esa tienda — ignora cualquier tiendaId que el cliente intente enviar
// (evita pedidos cruzados por frontend desactualizado o manipulación).
// ============================================
router.post(
  "/",
  scopeBodyToTienda,
  validate({ body: createPedidoSchema }),
  async (req, res, next) => {
    try {
      const data = await pedidosService.create(req.body);
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
