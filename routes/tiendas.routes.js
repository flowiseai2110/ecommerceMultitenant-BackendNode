import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
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

const router = Router();
 
router.get(
  "/",
  validate({ query: paginationSchema }),
  tiendasController.findAll
);

// GET - Stats de una tienda (4 COUNTs + 1 aggregate en paralelo)
router.get(
  "/:tiendaId/stats",
  authMiddleware,
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
  validate({ params: idParamSchema }),
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
  tiendasController.update
);
 
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  tiendasController.delete
);

export default router;
