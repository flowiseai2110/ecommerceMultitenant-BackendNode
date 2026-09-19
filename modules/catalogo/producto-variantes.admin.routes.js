import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
  authMiddleware,
  requireTiendaAccess,
  resolveTiendaId,
  scopeReadToResourceTienda
} from "../../kernel/tenant/index.js";
import {
  createVarianteSchema,
  updateVarianteSchema,
  idParamSchema,
  paginationSchema
} from "./producto-variantes.schema.js";
import { serializeVarianteAdmin } from "./producto-variantes.serializer.js";

// Crear instancias de las capas
const variantesRepository = new GenericRepository(prisma.producto_variantes, "ProductoVariante");
const variantesService = new GenericService(variantesRepository, {
  enableAudit: true,
  // producto_variantes no tiene tiendaId propio → se scopa por la relación producto.
  requireTiendaId: true,
  tenantRelation: "producto",
  allowedFilters: ["productoId", "activo"],
  allowedOrderBy: ["nombre", "fechaRegistro"]
});
const variantesController = new GenericController(variantesService, "ProductoVariante", {
  serialize: serializeVarianteAdmin
});

// Repositorio de productos, solo para resolver el tiendaId del producto padre
// al crear una variante (req.body.productoId).
const productosRepository = new GenericRepository(prisma.productos, "Producto");

// producto_variantes no tiene tiendaId propio: la tienda dueña se hereda
// del producto padre. Resolvemos vía productoId (creación) o vía la
// relación producto de la variante existente (actualización/eliminación/lectura).
const findVarianteTiendaId = (req) => {
  if (req.body?.productoId) {
    return productosRepository.findTiendaIdById(req.body.productoId);
  }
  return variantesRepository.findRelatedTiendaId(req.params.id, "producto");
};

const resolveVarianteTiendaId = resolveTiendaId(findVarianteTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en productos.
const scopeVarianteReadToOwner = scopeReadToResourceTienda(findVarianteTiendaId);

const router = Router();

// GET - Listar variantes de una tienda (admin)
// Exige membresía en la tienda (?tiendaId=); el scope se aplica vía la relación
// producto porque producto_variantes no tiene tiendaId propio.
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
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
