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
  createCategoriaSchema,
  updateCategoriaSchema,
  idParamSchema,
  paginationSchema
} from "./categorias.schema.js";
import { serializeCategoriaAdmin } from "./categorias.serializer.js";

// Crear instancias de las capas
const categoriasRepository = new GenericRepository(prisma.categorias, "Categoria");
const categoriasService = new GenericService(categoriasRepository, {
  enableAudit: true,
  defaultOrderBy: [{ orden: "asc" }, { fechaRegistro: "asc" }],
  // Read-policy admin: scope obligatorio + whitelist de filtros/orden.
  requireTiendaId: true,
  allowedFilters: ["activo", "categoriaPadreId"],
  allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
});
// El serializer admin define el contrato de salida campo por campo (incluye
// campos de auditoría, que el admin sí ve), reemplazando el viejo
// excludeFieldsInList y unificando la forma de listado y detalle.
const categoriasController = new GenericController(categoriasService, "Categoria", {
  serialize: serializeCategoriaAdmin
});

// Dueño real de la categoría en BD — compartido por las dos formas de scope
// de abajo (una para escritura, otra para lectura).
const findCategoriaTiendaId = (req) => categoriasRepository.findTiendaIdById(req.params.id);

// Resuelve el tiendaId dueño de la categoría cuando la petición no lo trae
// (rutas /:id de escritura), para que requireTiendaAccess pueda validar
// pertenencia.
const resolveCategoriaTiendaId = resolveTiendaId(findCategoriaTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en productos.
const scopeCategoriaReadToOwner = scopeReadToResourceTienda(findCategoriaTiendaId);

const router = Router();

// GET - Listar categorías de una tienda (admin)
// Exige membresía en la tienda (?tiendaId=) — antes cualquier usuario autenticado
// podía listar categorías de todas las tiendas omitiendo el filtro.
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  categoriasController.findAll
);

// GET - Obtener categoría por ID
router.get(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeCategoriaReadToOwner,
  requireTiendaAccess("viewer"),
  categoriasController.findById
);

// POST - Crear categoría
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ body: createCategoriaSchema }),
  categoriasController.create
);

// PUT - Actualizar categoría
router.put(
  "/:id",
  authMiddleware,
  resolveCategoriaTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateCategoriaSchema }),
  categoriasController.update
);

// DELETE - Eliminar categoría
router.delete(
  "/:id",
  authMiddleware,
  resolveCategoriaTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  categoriasController.delete
);

export default router;
