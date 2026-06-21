import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { idParamSchema, paginationSchema, homeQuerySchema } from "../../validators/productos.validator.js";

// Proyección de campos para listados públicos — reusada también por GET /home
const productosListSelect = {
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
};

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
  listSelect: productosListSelect
});
const productosController = new GenericController(productosService, "Producto");

const router = Router();

// GET / - Listar productos (público — filtra por la tienda del subdominio,
// o por ?tiendaId=&activo=true&categoriaId= como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, productosController.findAll);

// GET /home - Destacados + recientes en una sola llamada (público, para el home del storefront).
// Sin count() — el home no pagina, solo necesita un top-N de cada lista.
// Debe ir ANTES de /:id para que "home" no se intente validar como UUID.
router.get("/home", validate({ query: homeQuerySchema }), async (req, res, next) => {
  try {
    const { tiendaId, limit } = req.validatedQuery || req.query;
    const take = Math.min(limit || 8, 20);
    const baseWhere = { tiendaId, activo: true };

    const [destacados, recientes] = await Promise.all([
      prisma.productos.findMany({ where: { ...baseWhere, destacado: true }, take, orderBy: { id: "desc" }, select: productosListSelect }),
      prisma.productos.findMany({ where: baseWhere, take, orderBy: { fechaRegistro: "desc" }, select: productosListSelect })
    ]);

    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PRODUCTO_HOME", data: { destacados, recientes } });
  } catch (error) {
    next(error);
  }
});

// GET /:id - Obtener producto con variantes e imágenes (público)
router.get("/:id", validate({ params: idParamSchema }), productosController.findById);

export default router;
