import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import ZonasEnvioRepository from "../../repositories/zonas-envio.repository.js";
import ZonasEnvioService from "../../services/zonas-envio.service.js";
import { idParamSchema, paginationSchema } from "../../validators/zonas-envio.validator.js";

const zonasEnvioRepository = new ZonasEnvioRepository(prisma.zonas_envio);
const zonasEnvioService = new ZonasEnvioService(zonasEnvioRepository);

const router = Router();

// ============================================
// GET / - Listar zonas de envío (público — filtra por la tienda del
// subdominio, o por ?tiendaId= como fallback en dev/dominio genérico)
// ============================================
router.get(
  "/",
  validate({ query: paginationSchema }),
  scopeQueryToTienda,
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
// GET /:id - Obtener zona de envío por ID (público)
// ============================================
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const data = await zonasEnvioService.findById(req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONA_ENVIO_FOUND", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
