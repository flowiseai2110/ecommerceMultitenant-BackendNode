import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { idParamSchema, paginationSchema } from "../../validators/metodos-pago.validator.js";

const metodosPagoRepository = new GenericRepository(prisma.metodos_pago, "Método de pago");
const metodosPagoService = new GenericService(metodosPagoRepository, {
  enableAudit: false,
  searchFields: ["nombre"]
});
const metodosPagoController = new GenericController(metodosPagoService, "MetodoPago");

const router = Router();

// GET / - Listar métodos de pago activos (público — filtra por la tienda del
// subdominio, o por ?tiendaId=&activo=true como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, metodosPagoController.findAll);

// GET /:id - Obtener método de pago por ID (público)
router.get("/:id", validate({ params: idParamSchema }), metodosPagoController.findById);

export default router;
