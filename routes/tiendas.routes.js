import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import {
  createTiendaSchema,
  updateTiendaSchema,
  idParamSchema,
  tiendaIdParamSchema,
  paginationSchema
} from "../validators/tiendas.validator.js";

// Crear instancias de las capas
const tiendasRepository = new GenericRepository(prisma.tiendas, "Tiendas");
const tiendaService = new GenericService(tiendasRepository, { enableAudit: true });
const tiendasController = new GenericController(tiendaService, "Tiendas");

// La tienda es su propio recurso raíz: su "tiendaId" para fines de acceso
// es su propio id. Mapeamos params.id → params.tiendaId para que
// requireTiendaAccess pueda validar la membresía del usuario.
const resolveTiendaIdFromId = resolveTiendaId(async (req) => req.params.id);

const router = Router();

// GET / - Listar SOLO las tiendas a las que el usuario pertenece
// (antes devolvía todas las tiendas de la plataforma a cualquier usuario autenticado)
router.get(
  "/",
  authMiddleware,
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 100);

      const membresias = await prisma.usuario_tiendas.findMany({
        where: { userId: req.user.id, activo: true },
        select: { tiendaId: true }
      });
      const tiendaIds = membresias.map(m => m.tiendaId);

      const where = { id: { in: tiendaIds } };
      const [data, total] = await Promise.all([
        prisma.tiendas.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { fechaRegistro: "desc" }
        }),
        prisma.tiendas.count({ where })
      ]);

      return apiResponse(res, {
        status: 200, type: "SUCCESS", code: "TIENDAS_LIST", data,
        meta: {
          total, page, limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET - Stats de una tienda (4 COUNTs + 1 aggregate en paralelo)
router.get(
  "/:tiendaId/stats",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: tiendaIdParamSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId } = req.params;

      const [
        categorias,
        productos,
        pedidosTotal,
        pedidosPendientes,
        clientes,
        miembros,
        ventas
      ] = await Promise.all([
        prisma.categorias.count({ where: { tiendaId } }),
        prisma.productos.count({ where: { tiendaId, activo: true } }),
        prisma.pedidos.count({ where: { tiendaId } }),
        prisma.pedidos.count({ where: { tiendaId, estado: "pendiente" } }),
        prisma.clientes.count({ where: { tiendaId } }),
        prisma.usuario_tiendas.count({ where: { tiendaId, activo: true } }),
        prisma.pedidos.aggregate({
          where: { tiendaId },
          _sum: { total: true }
        })
      ]);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDA_STATS",
        data: {
          categorias,
          productos,
          pedidos: {
            total: pedidosTotal,
            pendientes: pedidosPendientes
          },
          clientes,
          miembros,
          ventasTotal: ventas._sum.total ?? 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
);
 
router.get(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("viewer"),
  tiendasController.findById
);

router.post(
  "/",
  authMiddleware,
  validate({ body: createTiendaSchema }),
  tiendasController.create
);

router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateTiendaSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  tiendasController.update
);

router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("owner"),
  tiendasController.delete
);

export default router;
