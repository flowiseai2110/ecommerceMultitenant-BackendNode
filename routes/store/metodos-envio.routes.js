import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { idParamSchema, paginationSchema } from "../../validators/metodos-envio.validator.js";

const metodosEnvioRepository = new GenericRepository(prisma.metodos_envio, "Método de envío");
const metodosEnvioService = new GenericService(metodosEnvioRepository, {
  enableAudit: false,
  searchFields: ["nombre"]
});
const metodosEnvioController = new GenericController(metodosEnvioService, "MetodoEnvio");

const router = Router();

// GET / - Listar métodos de envío activos (público — filtra por la tienda del
// subdominio, o por ?tiendaId=&activo=true como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, metodosEnvioController.findAll);

// GET /:id - Obtener método de envío por ID (público)
router.get("/:id", validate({ params: idParamSchema }), metodosEnvioController.findById);

export default router;
