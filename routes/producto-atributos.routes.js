import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId, scopeReadToResourceTienda } from "../middlewares/tienda-access.middleware.js";
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

// Dueño real del atributo en BD — compartido por las dos formas de scope
// de abajo (una para escritura, otra para lectura).
const findAtributoTiendaId = async (req) => {
  const atributo = await prisma.producto_atributos.findUnique({
    where: { id: req.params.id },
    select: { tiendaId: true }
  });
  return atributo?.tiendaId || null;
};

// Resuelve el tiendaId dueño del atributo cuando la petición no lo trae
// (rutas /:id de escritura), para que requireTiendaAccess pueda validar
// pertenencia.
const resolveAtributoTiendaId = resolveTiendaId(findAtributoTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en
// productos.routes.js.
const scopeAtributoReadToOwner = scopeReadToResourceTienda(findAtributoTiendaId);

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
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeAtributoReadToOwner,
  requireTiendaAccess("viewer"),
  atributosController.findById
);

// POST - Crear atributo
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ body: createAtributoSchema }),
  atributosController.create
);

// PUT - Actualizar atributo
router.put(
  "/:id",
  authMiddleware,
  resolveAtributoTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateAtributoSchema }),
  atributosController.update
);

// DELETE - Eliminar atributo
router.delete(
  "/:id",
  authMiddleware,
  resolveAtributoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  atributosController.delete
);

export default router;
