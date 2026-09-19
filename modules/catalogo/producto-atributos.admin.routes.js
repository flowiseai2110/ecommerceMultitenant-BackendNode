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
  createAtributoSchema,
  updateAtributoSchema,
  idParamSchema,
  paginationSchema
} from "./producto-atributos.schema.js";
import { serializeAtributoAdmin } from "./producto-atributos.serializer.js";

// Crear instancias de las capas
const atributosRepository = new GenericRepository(prisma.producto_atributos, "ProductoAtributo");
const atributosService = new GenericService(atributosRepository, {
  enableAudit: true,
  // Read-policy admin: scope obligatorio + whitelist.
  requireTiendaId: true,
  allowedFilters: ["aplicaA"],
  allowedOrderBy: ["nombre", "fechaRegistro"]
});
const atributosController = new GenericController(atributosService, "ProductoAtributo", {
  serialize: serializeAtributoAdmin
});

// Dueño real del atributo en BD — compartido por las dos formas de scope
// de abajo (una para escritura, otra para lectura).
const findAtributoTiendaId = (req) => atributosRepository.findTiendaIdById(req.params.id);

// Resuelve el tiendaId dueño del atributo cuando la petición no lo trae
// (rutas /:id de escritura), para que requireTiendaAccess pueda validar
// pertenencia.
const resolveAtributoTiendaId = resolveTiendaId(findAtributoTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en productos.
const scopeAtributoReadToOwner = scopeReadToResourceTienda(findAtributoTiendaId);

const router = Router();

// GET - Listar atributos de una tienda (admin)
// Exige membresía en la tienda (?tiendaId=).
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
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
