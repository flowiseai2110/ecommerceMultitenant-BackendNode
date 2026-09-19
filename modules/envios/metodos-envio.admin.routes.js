import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess, resolveTiendaId } from "../../kernel/tenant/index.js";
import {
  createMetodoEnvioSchema,
  updateMetodoEnvioSchema,
  idParamSchema,
  paginationSchema
} from "./metodos-envio.schema.js";

const metodosEnvioRepository = new GenericRepository(prisma.metodos_envio, "Método de envío");
const metodosEnvioService = new GenericService(metodosEnvioRepository, { enableAudit: false });
const metodosEnvioController = new GenericController(metodosEnvioService, "MetodoEnvio");

// Resuelve el tiendaId dueño del método de envío cuando la petición no lo trae
// (rutas /:id), para que requireTiendaAccess pueda validar pertenencia.
const resolveMetodoEnvioTiendaId = resolveTiendaId(
  (req) => metodosEnvioRepository.findTiendaIdById(req.params.id)
);

const router = Router();

// GET - Listar métodos de envío de una tienda (admin)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  metodosEnvioController.findAll
);

// GET - Obtener método de envío por ID (admin)
router.get(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  metodosEnvioController.findById
);

// POST - Crear método de envío (admin)
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: createMetodoEnvioSchema }),
  metodosEnvioController.create
);

// PUT - Actualizar método de envío (admin)
router.put(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: updateMetodoEnvioSchema }),
  metodosEnvioController.update
);

// DELETE - Eliminar método de envío (admin)
router.delete(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  metodosEnvioController.delete
);

export default router;
