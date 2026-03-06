import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { idParamSchema, paginationSchema } from "../../validators/categorias.validator.js";

const categoriasRepository = new GenericRepository(prisma.categorias, "Categoria");
const categoriasService = new GenericService(categoriasRepository, {
  searchFields: ["nombre", "slug"],
  excludeFieldsInList: ["fechaRegistro", "usuarioRegistro", "fechaActualizacion", "usuarioActualizacion"]
});
const categoriasController = new GenericController(categoriasService, "Categoria");

const router = Router();

// GET / - Listar categorías (público — filtra por ?tiendaId=&activo=true)
router.get("/", validate({ query: paginationSchema }), categoriasController.findAll);

// GET /:id - Obtener categoría por ID (público)
router.get("/:id", validate({ params: idParamSchema }), categoriasController.findById);

export default router;
