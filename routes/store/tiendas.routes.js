import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { idParamSchema, paginationSchema } from "../../validators/tiendas.validator.js";

const tiendasRepository = new GenericRepository(prisma.tiendas, "Tienda");
const tiendasService = new GenericService(tiendasRepository, {
  searchFields: ["nombre", "slug"]
});
const tiendasController = new GenericController(tiendasService, "Tienda");

const router = Router();

// GET / - Listar tiendas (público — para lookup por slug)
router.get("/", validate({ query: paginationSchema }), tiendasController.findAll);

// GET /:id - Obtener tienda por ID (público)
router.get("/:id", validate({ params: idParamSchema }), tiendasController.findById);

export default router;
