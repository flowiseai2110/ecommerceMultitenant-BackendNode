import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { idParamSchema, paginationSchema } from "./tiendas.schema.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { getTiendasStore, setTiendasStore } from "./tiendas.cache.js";

const tiendasRepository = new GenericRepository(prisma.tiendas, "Tienda");
const tiendasService = new GenericService(tiendasRepository, {
  searchFields: ["nombre", "slug"]
});
const tiendasController = new GenericController(tiendasService, "Tienda");

const router = Router();

// GET / - Listar tiendas (público — para lookup por slug)
router.get("/", validate({ query: paginationSchema }), async (req, res, next) => {
  try {
    const query = req.validatedQuery || req.query;
    const cacheKey = JSON.stringify(query);

    const cached = getTiendasStore(cacheKey);
    if (cached) {
      return apiResponse(res, cached);
    }

    const { data, meta } = await tiendasService.findAll(query);

    // Cuando el storefront resuelve una tienda puntual por slug, se adjunta
    // su personalización visual (barra de anuncios, hero) para evitar un
    // segundo request público. La invalidación llega vía
    // invalidateTiendasStoreCache() al guardar el diseño en el admin.
    if (query.slug && data.length === 1) {
      data[0].diseno = await getDiseno(data[0].id);
    }

    const responsePayload = { status: 200, type: "SUCCESS", code: "TIENDA_LIST", data, meta };
    setTiendasStore(cacheKey, responsePayload);

    return apiResponse(res, responsePayload);
  } catch (error) {
    next(error);
  }
});

// GET /:id - Obtener tienda por ID (público)
router.get("/:id", validate({ params: idParamSchema }), tiendasController.findById);

export default router;
