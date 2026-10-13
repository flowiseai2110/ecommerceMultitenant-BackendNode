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
import { requiereCapacidad } from "../negocio/negocio.middleware.js";
import { createMarcaSchema, updateMarcaSchema, idParamSchema, paginationSchema } from "./marcas.schema.js";
import { serializeMarcaAdmin } from "./marcas.serializer.js";

// Marcas de la tienda: solo rubros con la capacidad `marcas` (modules/negocio).
const marcasRepository = new GenericRepository(prisma.marcas, "Marca");
const marcasService = new GenericService(marcasRepository, {
  enableAudit: true,
  defaultOrderBy: [{ orden: "asc" }, { nombre: "asc" }],
  searchFields: ["nombre", "slug"],
  requireTiendaId: true,
  allowedFilters: ["activo"],
  allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
});
const marcasController = new GenericController(marcasService, "Marca", {
  serialize: serializeMarcaAdmin
});

const findMarcaTiendaId = (req) => marcasRepository.findTiendaIdById(req.params.id);
const resolveMarcaTiendaId = resolveTiendaId(findMarcaTiendaId);
const scopeMarcaReadToOwner = scopeReadToResourceTienda(findMarcaTiendaId);
const conMarcas = requiereCapacidad("marcas");

const router = Router();

// GET - Listar marcas de una tienda (?tiendaId=)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  conMarcas,
  validate({ query: paginationSchema }),
  marcasController.findAll
);

// GET - Obtener marca por ID
router.get(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeMarcaReadToOwner,
  requireTiendaAccess("viewer"),
  marcasController.findById
);

// POST - Crear marca
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  conMarcas,
  validate({ body: createMarcaSchema }),
  marcasController.create
);

// PUT - Actualizar marca
router.put(
  "/:id",
  authMiddleware,
  resolveMarcaTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateMarcaSchema }),
  marcasController.update
);

// DELETE - Eliminar marca (sus productos quedan sin marca: ON DELETE SET NULL)
router.delete(
  "/:id",
  authMiddleware,
  resolveMarcaTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  marcasController.delete
);

export default router;
