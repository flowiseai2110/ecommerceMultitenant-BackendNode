import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { idParamSchema, paginationSchema } from "./categorias.schema.js";
import { serializeCategoriaStore } from "./categorias.serializer.js";

const categoriasRepository = new GenericRepository(prisma.categorias, "Categoria");
const categoriasService = new GenericService(categoriasRepository, {
  searchFields: ["nombre", "slug"]
});
// El serializer del store define el contrato de salida campo por campo (excluye
// auditoría en listado Y detalle), reemplazando el viejo excludeFieldsInList.
const categoriasController = new GenericController(categoriasService, "Categoria", {
  serialize: serializeCategoriaStore
});

const router = Router();

// GET / - Listar categorías (público — filtra por la tienda del subdominio,
// o por ?tiendaId=&activo=true como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, categoriasController.findAll);

// GET /:id - Obtener categoría por ID (público)
router.get("/:id", validate({ params: idParamSchema }), categoriasController.findById);

export default router;
