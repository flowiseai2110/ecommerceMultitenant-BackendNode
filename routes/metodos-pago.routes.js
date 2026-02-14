import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createMetodoPagoSchema,
  updateMetodoPagoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/metodos-pago.validator.js";

const metodosPagoRepository = new GenericRepository(prisma.metodos_pago, "Método de pago");
const metodosPagoService = new GenericService(metodosPagoRepository, { enableAudit: false });
const metodosPagoController = new GenericController(metodosPagoService, "MetodoPago");

const router = Router();

// GET - Listar métodos de pago (público para storefront)
router.get(
  "/",
  validate({ query: paginationSchema }),
  metodosPagoController.findAll
);

// GET - Obtener método de pago por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  metodosPagoController.findById
);

// POST - Crear método de pago (admin)
router.post(
  "/",
  authMiddleware,
  validate({ body: createMetodoPagoSchema }),
  metodosPagoController.create
);

// PUT - Actualizar método de pago (admin)
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateMetodoPagoSchema }),
  metodosPagoController.update
);

// DELETE - Eliminar método de pago (admin)
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  metodosPagoController.delete
);

export default router;
