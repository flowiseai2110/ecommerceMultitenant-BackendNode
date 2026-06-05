import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createCategoriaSchema,
  updateCategoriaSchema,
  idParamSchema,
  paginationSchema
} from "../validators/categorias.validator.js";

// Crear instancias de las capas
const categoriasRepository = new GenericRepository(prisma.categorias, "Categoria");
const categoriasService = new GenericService(categoriasRepository, {
  enableAudit: true,
  excludeFieldsInList: ["fechaRegistro", "usuarioRegistro", "fechaActualizacion", "usuarioActualizacion"],
  defaultOrderBy: [{ orden: "asc" }, { fechaRegistro: "asc" }]
});
const categoriasController = new GenericController(categoriasService, "Categoria");

const router = Router();

// GET - Listar todas las categorías
router.get(
  "/",
  validate({ query: paginationSchema }),
  categoriasController.findAll 
);

// GET - Obtener categoría por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  categoriasController.findById
);

// POST - Crear categoría
router.post(
  "/",
  authMiddleware,
  validate({ body: createCategoriaSchema }),
  categoriasController.create
);

// PUT - Actualizar categoría
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateCategoriaSchema }),
  categoriasController.update
);

// DELETE - Eliminar categoría
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  categoriasController.delete
);

export default router;
