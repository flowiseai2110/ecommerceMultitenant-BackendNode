import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess } from "../middlewares/tienda-access.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import PedidosRepository from "../repositories/pedidos.repository.js";
import PedidosService from "../services/pedidos.service.js";
import {
  updateEstadoSchema,
  updateEstadoPagoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/pedidos.validator.js";

const pedidosRepository = new PedidosRepository(prisma.pedidos);
const pedidosService = new PedidosService(pedidosRepository);

const router = Router();

// ============================================
// GET /resumen - Listado compacto para tabla del admin
// GET /admin/pedidos/resumen?tiendaId=xxx&estado=pendiente
// Devuelve: numeroPedido, cliente.nombre, estado, total, fechaRegistro
// ============================================
router.get(
  "/resumen",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const { page = 1, limit = 20, tiendaId, estado } = query;

      const take = Math.min(parseInt(limit) || 20, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;

      const where = { tiendaId };
      if (estado) where.estado = estado;

      const [data, total] = await Promise.all([
        prisma.pedidos.findMany({
          where,
          orderBy: { fechaRegistro: "desc" },
          select: {
            id: true,
            numeroPedido: true,
            estado: true,
            total: true,
            fechaRegistro: true,
            cliente: { select: { nombre: true } }
          },
          skip,
          take
        }),
        prisma.pedidos.count({ where })
      ]);

      const p = parseInt(page) || 1;
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDOS_RESUMEN",
        data,
        meta: {
          total,
          page: p,
          limit: take,
          totalPages: Math.ceil(total / take),
          hasNextPage: p < Math.ceil(total / take),
          hasPrevPage: p > 1
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET / - Listar pedidos (requiere tiendaId en query)
// GET /admin/pedidos?tiendaId=xxx
// ============================================
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const { data, meta } = await pedidosService.findAll(query);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDOS_LIST", data, meta });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /:id - Obtener pedido por ID
// GET /admin/pedidos/:id?tiendaId=xxx
// ============================================
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const data = await pedidosService.findById(req.params.id, req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_FOUND", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id/estado - Actualizar estado
// PUT /admin/pedidos/:id/estado?tiendaId=xxx
// ============================================
router.put(
  "/:id/estado",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateEstadoSchema }),
  async (req, res, next) => {
    try {
      const { estado, notas } = req.body;
      const data = await pedidosService.updateEstado(
        req.params.id, estado, notas, req.user, req.tiendaId
      );
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_ESTADO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id/pago - Actualizar estado de pago
// PUT /admin/pedidos/:id/pago?tiendaId=xxx
// ============================================
router.put(
  "/:id/pago",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateEstadoPagoSchema }),
  async (req, res, next) => {
    try {
      const { estadoPago, referenciaPago, metodoPago } = req.body;
      const data = await pedidosService.updatePago(
        req.params.id, estadoPago, referenciaPago, metodoPago, req.user, req.tiendaId
      );
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_PAGO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /:id - Eliminar pedido
// DELETE /admin/pedidos/:id?tiendaId=xxx
// ============================================
router.delete(
  "/:id",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      await pedidosService.delete(req.params.id, req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_DELETED", data: null });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
