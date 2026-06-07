import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
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

// producto_variantes no tiene tiendaId propio: la tienda dueña se hereda
// del producto padre. Resolvemos vía productoId (creación) o vía la
// relación producto de la variante existente (actualización/eliminación).
const resolveVarianteTiendaId = resolveTiendaId(async (req) => {
  if (req.body?.productoId) {
    const producto = await prisma.productos.findUnique({
      where: { id: req.body.productoId },
      select: { tiendaId: true }
    });
    return producto?.tiendaId || null;
  }

  const variante = await prisma.producto_variantes.findUnique({
    where: { id: req.params.id },
    select: { producto: { select: { tiendaId: true } } }
  });
  return variante?.producto?.tiendaId || null;
});

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
  resolveVarianteTiendaId,
  requireTiendaAccess("editor"),
  validate({ body: createVarianteSchema }),
  variantesController.create
);

// PUT - Actualizar variante
router.put(
  "/:id",
  authMiddleware,
  resolveVarianteTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateVarianteSchema }),
  variantesController.update
);

// DELETE - Eliminar variante
router.delete(
  "/:id",
  authMiddleware,
  resolveVarianteTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  variantesController.delete
);

export default router;
