import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess } from "../middlewares/tienda-access.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import ZonasEnvioRepository from "../repositories/zonas-envio.repository.js";
import ZonasEnvioService from "../services/zonas-envio.service.js";
import {
  createZonaEnvioSchema,
  updateZonaEnvioSchema,
  idParamSchema,
  paginationSchema
} from "../validators/zonas-envio.validator.js";

const zonasEnvioRepository = new ZonasEnvioRepository(prisma.zonas_envio);
const zonasEnvioService = new ZonasEnvioService(zonasEnvioRepository);

const router = Router();

// ============================================
// GET / - Listar zonas de envío (admin)
// GET /admin/zonas-envio?tiendaId=xxx
// ============================================
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const { data, meta } = await zonasEnvioService.findAll(query);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONAS_ENVIO_LIST", data, meta });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /:id - Obtener zona de envío por ID (admin)
// GET /admin/zonas-envio/:id?tiendaId=xxx
// ============================================
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const data = await zonasEnvioService.findById(req.params.id, req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONA_ENVIO_FOUND", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST / - Crear zona de envío (admin)
// tiendaId viene en el body
// ============================================
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: createZonaEnvioSchema }),
  async (req, res, next) => {
    try {
      const data = await zonasEnvioService.create(req.body);
      return apiResponse(res, { status: 201, type: "SUCCESS", code: "ZONA_ENVIO_CREATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id - Actualizar zona de envío (admin)
// PUT /admin/zonas-envio/:id?tiendaId=xxx
// ============================================
router.put(
  "/:id",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: updateZonaEnvioSchema }),
  async (req, res, next) => {
    try {
      const data = await zonasEnvioService.update(req.params.id, req.body, req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONA_ENVIO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /:id - Eliminar zona de envío (admin)
// DELETE /admin/zonas-envio/:id?tiendaId=xxx
// ============================================
router.delete(
  "/:id",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      await zonasEnvioService.delete(req.params.id, req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONA_ENVIO_DELETED", data: null });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
