import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
import {
  createProductoSchema,
  updateProductoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/productos.validator.js";

// Crear instancias de las capas
const productosRepository = new GenericRepository(prisma.productos, "Producto");
const productosService = new GenericService(productosRepository, {
  enableAudit: true,
  // findById trae variantes e imágenes completas
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
  includePresets: {
    // ?include=full para detalle completo desde listado
    full: {
      variantes: {
        where: { activo: true },
        select: { id: true, nombre: true, sku: true, precio: true, stock: true, atributos: true, activo: true }
      },
      imagenes: {
        orderBy: { orden: "asc" },
        select: { id: true, url: true, textoAlternativo: true, orden: true, esPrincipal: true }
      }
    }
  },
  // listSelect: en el listado solo traemos los campos esenciales para la tabla/grilla del frontend
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
    // Solo imagen principal en el listado
    imagenes: {
      where: { esPrincipal: true },
      take: 1,
      select: { id: true, url: true, textoAlternativo: true }
    }
  }
});
const productosController = new GenericController(productosService, "Producto");

// Resuelve el tiendaId dueño del producto cuando la petición no lo trae
// (rutas /:id), para que requireTiendaAccess pueda validar pertenencia.
const resolveProductoTiendaId = resolveTiendaId(async (req) => {
  const producto = await prisma.productos.findUnique({
    where: { id: req.params.id },
    select: { tiendaId: true }
  });
  return producto?.tiendaId || null;
});

const router = Router();

// GET - Listar todos los productos
router.get(
  "/",
  validate({ query: paginationSchema }),
  productosController.findAll
);

// GET - Obtener producto por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  productosController.findById
);

// POST - Crear producto
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ body: createProductoSchema }),
  productosController.create
);

// PUT - Actualizar producto
router.put(
  "/:id",
  authMiddleware,
  resolveProductoTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateProductoSchema }),
  productosController.update
);

// DELETE - Eliminar producto
router.delete(
  "/:id",
  authMiddleware,
  resolveProductoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  productosController.delete
);

export default router;
