import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createProductoSchema,
  updateProductoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/productos.validator.js";

// Crear instancias de las capas
const productosRepository = new GenericRepository(prisma.productos, "Producto");
const productosService = new GenericService(productosRepository, {
  enableAudit: true,
  include: {
    variantes: true,
    imagenes: true
  },
  searchFields: ["nombre", "descripcion", "descripcionCorta", "slug"]
});
const productosController = new GenericController(productosService, "Producto");

const router = Router();

// GET - Listar todos los productos
router.get(
  "/",
  validate({ query: paginationSchema }),
  productosController.findAll
);

// GET - Obtener producto por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  productosController.findById
);

// POST - Crear producto
router.post(
  "/",
  authMiddleware,
  validate({ body: createProductoSchema }),
  productosController.create
);

// PUT - Actualizar producto
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateProductoSchema }),
  productosController.update
);

// DELETE - Eliminar producto
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  productosController.delete
);

export default router;
