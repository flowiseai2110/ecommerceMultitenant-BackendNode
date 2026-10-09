import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { idParamSchema, paginationSchema } from "./categorias.schema.js";
import { serializeCategoriaStore } from "./categorias.serializer.js";
import { traducirFila } from "../traducciones/traducciones.service.js";

const categoriasRepository = new GenericRepository(prisma.categorias, "Categoria");
const categoriasService = new GenericService(categoriasRepository, {
  searchFields: ["nombre", "slug"],
  // Read-policy store: sin tiendaId (subdominio o ?tiendaId=) no se lista nada,
  // en vez de devolver categorías de todas las tiendas.
  requireTiendaId: true,
  allowedFilters: ["activo", "categoriaPadreId"],
  allowedOrderBy: ["orden", "nombre", "fechaRegistro"]
});
// El serializer del store define el contrato de salida campo por campo (excluye
// auditoría en listado Y detalle), reemplazando el viejo excludeFieldsInList.
const categoriasController = new GenericController(categoriasService, "Categoria", {
  serialize: serializeCategoriaStore
});
// Inglés (docs/specs/hospedaje-completo C3): mismo listado con nombre y descripción traducidos.
const categoriasControllerEn = new GenericController(categoriasService, "Categoria", {
  serialize: (c) => serializeCategoriaStore(traducirFila(c, ["nombre", "descripcion"], "en"))
});
const porIdioma = (accion) => (req, res, next) =>
  (req.query.lang === "en" ? categoriasControllerEn : categoriasController)[accion](req, res, next);

const router = Router();

// GET / - Listar categorías (público — filtra por la tienda del subdominio,
// o por ?tiendaId=&activo=true como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, porIdioma("findAll"));

// GET /:id - Obtener categoría por ID (público)
router.get("/:id", validate({ params: idParamSchema }), porIdioma("findById"));

export default router;
