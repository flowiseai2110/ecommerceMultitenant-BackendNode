import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createImagenSchema,
  updateImagenSchema,
  idParamSchema,
  paginationSchema
} from "../validators/producto-imagenes.validator.js";

// Crear instancias de las capas
const imagenesRepository = new GenericRepository(prisma.producto_imagenes, "ProductoImagen");
const imagenesService = new GenericService(imagenesRepository, { enableAudit: true });
const imagenesController = new GenericController(imagenesService, "ProductoImagen");

const router = Router();

// GET - Listar todas las imágenes
router.get(
  "/",
  validate({ query: paginationSchema }),
  imagenesController.findAll
);

// GET - Obtener imagen por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  imagenesController.findById
);

// POST - Crear imagen
router.post(
  "/",
  authMiddleware,
  validate({ body: createImagenSchema }),
  imagenesController.create
);

// PUT - Actualizar imagen
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateImagenSchema }),
  imagenesController.update
);

// DELETE - Eliminar imagen
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  imagenesController.delete
);

export default router;
