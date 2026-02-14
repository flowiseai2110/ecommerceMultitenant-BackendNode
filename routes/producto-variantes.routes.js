import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createVarianteSchema,
  updateVarianteSchema,
  idParamSchema,
  paginationSchema
} from "../validators/producto-variantes.validator.js";

// Crear instancias de las capas
const variantesRepository = new GenericRepository(prisma.producto_variantes, "ProductoVariante");
const variantesService = new GenericService(variantesRepository, { enableAudit: true });
const variantesController = new GenericController(variantesService, "ProductoVariante");

const router = Router();

// GET - Listar todas las variantes
router.get(
  "/",
  validate({ query: paginationSchema }),
  variantesController.findAll
);

// GET - Obtener variante por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  variantesController.findById
);

// POST - Crear variante
router.post(
  "/",
  authMiddleware,
  validate({ body: createVarianteSchema }),
  variantesController.create
);

// PUT - Actualizar variante
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateVarianteSchema }),
  variantesController.update
);

// DELETE - Eliminar variante
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  variantesController.delete
);

export default router;
