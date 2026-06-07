import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { idParamSchema, paginationSchema } from "../../validators/productos.validator.js";

const productosRepository = new GenericRepository(prisma.productos, "Producto");
const productosService = new GenericService(productosRepository, {
  include: {
    variantes: {
      where: { activo: true },
      select: { id: true, nombre: true, sku: true, precio: true, stock: true, atributos: true, activo: true }
    },
    imagenes: {
      orderBy: { orden: "asc" },
      select: { id: true, url: true, textoAlternativo: true, orden: true, esPrincipal: true }
    }
  },
  searchFields: ["nombre", "descripcion", "descripcionCorta", "slug", "sku"],
  listSelect: {
    id: true,
    tiendaId: true,
    categoriaId: true,
    nombre: true,
    slug: true,
    descripcionCorta: true,
    sku: true,
    precioBase: true,
    precioOferta: true,
    stock: true,
    activo: true,
    destacado: true,
    esServicio: true,
    etiquetas: true,
    imagenes: {
      where: { esPrincipal: true },
      take: 1,
      select: { id: true, url: true, textoAlternativo: true }
    }
  }
});
const productosController = new GenericController(productosService, "Producto");

const router = Router();

// GET / - Listar productos (público — filtra por la tienda del subdominio,
// o por ?tiendaId=&activo=true&categoriaId= como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, productosController.findAll);

// GET /:id - Obtener producto con variantes e imágenes (público)
router.get("/:id", validate({ params: idParamSchema }), productosController.findById);

export default router;
