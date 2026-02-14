import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createTiendaSchema,
  updateTiendaSchema,
  idParamSchema,
  paginationSchema
} from "../validators/tiendas.validator.js";

// Crear instancias de las capas
const tiendasRepository = new GenericRepository(prisma.tiendas, "Tiendas");
const tiendaService = new GenericService(tiendasRepository, { enableAudit: true });
const tiendasController = new GenericController(tiendaService, "Tiendas");

const router = Router();
 
router.get(
  "/",
  validate({ query: paginationSchema }),
  tiendasController.findAll
);
 
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  tiendasController.findById
);
 
router.post(
  "/",
  authMiddleware,
  validate({ body: createTiendaSchema }),
  tiendasController.create
);
 
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateTiendaSchema }),
  tiendasController.update
);
 
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  tiendasController.delete
);

export default router;
