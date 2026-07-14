import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId, scopeReadToResourceTienda } from "../middlewares/tienda-access.middleware.js";
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
// relación producto de la variante existente (actualización/eliminación/lectura).
const findVarianteTiendaId = async (req) => {
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
};

const resolveVarianteTiendaId = resolveTiendaId(findVarianteTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en
// productos.routes.js.
const scopeVarianteReadToOwner = scopeReadToResourceTienda(findVarianteTiendaId);

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
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeVarianteReadToOwner,
  requireTiendaAccess("viewer"),
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
// producto_variantes no tiene tiendaId propio (ver resolveVarianteTiendaId),
// así que se limpia para que GenericRepository.update no intente filtrar por
// una columna inexistente. skipExistsCheck evita repetir la consulta de
// existencia: resolveVarianteTiendaId ya la hizo para resolver la tienda dueña.
router.put(
  "/:id",
  authMiddleware,
  resolveVarianteTiendaId,
  requireTiendaAccess("editor"),
  (req, _res, next) => { req.tiendaId = null; req.skipExistsCheck = true; next(); },
  validate({ params: idParamSchema, body: updateVarianteSchema }),
  variantesController.update
);

// DELETE - Eliminar variante
router.delete(
  "/:id",
  authMiddleware,
  resolveVarianteTiendaId,
  requireTiendaAccess("admin"),
  (req, _res, next) => { req.tiendaId = null; next(); },
  validate({ params: idParamSchema }),
  variantesController.delete
);

export default router;
