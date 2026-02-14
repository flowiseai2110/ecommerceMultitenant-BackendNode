import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createAtributoSchema,
  updateAtributoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/producto-atributos.validator.js";

// Crear instancias de las capas
const atributosRepository = new GenericRepository(prisma.producto_atributos, "ProductoAtributo");
const atributosService = new GenericService(atributosRepository, { enableAudit: true });
const atributosController = new GenericController(atributosService, "ProductoAtributo");

const router = Router();

// GET - Listar todos los atributos
router.get(
  "/",
  validate({ query: paginationSchema }),
  atributosController.findAll
);

// GET - Obtener atributo por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  atributosController.findById
);

// POST - Crear atributo
router.post(
  "/",
  authMiddleware,
  validate({ body: createAtributoSchema }),
  atributosController.create
);

// PUT - Actualizar atributo
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateAtributoSchema }),
  atributosController.update
);

// DELETE - Eliminar atributo
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  atributosController.delete
);

export default router;
