import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
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

// producto_imagenes no tiene tiendaId propio: la tienda dueña se hereda
// del producto padre. Resolvemos vía productoId (creación) o vía la
// relación producto de la imagen existente (actualización/eliminación).
const resolveImagenTiendaId = resolveTiendaId(async (req) => {
  if (req.body?.productoId) {
    const producto = await prisma.productos.findUnique({
      where: { id: req.body.productoId },
      select: { tiendaId: true }
    });
    return producto?.tiendaId || null;
  }

  const imagen = await prisma.producto_imagenes.findUnique({
    where: { id: req.params.id },
    select: { producto: { select: { tiendaId: true } } }
  });
  return imagen?.producto?.tiendaId || null;
});

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
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  validate({ body: createImagenSchema }),
  imagenesController.create
);

// PUT - Actualizar imagen
router.put(
  "/:id",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  (req, _res, next) => { req.tiendaId = null; next(); },
  validate({ params: idParamSchema, body: updateImagenSchema }),
  imagenesController.update
);

// DELETE - Eliminar imagen
router.delete(
  "/:id",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("admin"),
  (req, _res, next) => { req.tiendaId = null; next(); },
  validate({ params: idParamSchema }),
  imagenesController.delete
);

export default router;
