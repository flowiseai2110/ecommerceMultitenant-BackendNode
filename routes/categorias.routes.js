import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId, scopeReadToResourceTienda } from "../middlewares/tienda-access.middleware.js";
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

// Dueño real de la categoría en BD — compartido por las dos formas de scope
// de abajo (una para escritura, otra para lectura).
const findCategoriaTiendaId = async (req) => {
  const categoria = await prisma.categorias.findUnique({
    where: { id: req.params.id },
    select: { tiendaId: true }
  });
  return categoria?.tiendaId || null;
};

// Resuelve el tiendaId dueño de la categoría cuando la petición no lo trae
// (rutas /:id de escritura), para que requireTiendaAccess pueda validar
// pertenencia.
const resolveCategoriaTiendaId = resolveTiendaId(findCategoriaTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en
// productos.routes.js.
const scopeCategoriaReadToOwner = scopeReadToResourceTienda(findCategoriaTiendaId);

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
