import { Router } from "express";
import { uploadImage } from "../middlewares/upload.middleware.js";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId, scopeReadToResourceTienda } from "../middlewares/tienda-access.middleware.js";
import { makeUploadImagenForProducto } from "../controllers/producto-imagenes.controller.js";
import { invalidateProductoDetailCache } from "./store/productos.routes.js";

const uploadImagenForProducto = makeUploadImagenForProducto("tiendas");

// Invalida la cache pública del detalle (GET /store/productos/:id) cuando una
// escritura admin sobre ese producto termina en éxito.
function invalidateProductoCacheOnSuccess(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      invalidateProductoDetailCache(req.params.id);
    }
  });
  next();
}
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

// Dueño real del producto en BD — compartido por las dos formas de scope
// de abajo (una para escritura, otra para lectura).
const findProductoTiendaId = async (req) => {
  const producto = await prisma.productos.findUnique({
    where: { id: req.params.id },
    select: { tiendaId: true }
  });
  return producto?.tiendaId || null;
};

// Resuelve el tiendaId dueño del producto cuando la petición no lo trae
// (rutas /:id de escritura), para que requireTiendaAccess pueda validar
// pertenencia.
const resolveProductoTiendaId = resolveTiendaId(findProductoTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query (el admin manda la tienda
// seleccionada en la UI, que no necesariamente es la dueña del producto
// solicitado). Sin esto, cualquier usuario autenticado con membresía en
// CUALQUIER tienda podía leer el detalle completo de productos de otras
// tiendas (incluye precioCosto, stockAlerta, metadata) con solo conocer
// el UUID — ver auditoría de aislamiento multi-tenant.
const scopeProductoReadToOwner = scopeReadToResourceTienda(findProductoTiendaId);

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
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeProductoReadToOwner,
  requireTiendaAccess("viewer"),
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
  invalidateProductoCacheOnSuccess,
  productosController.update
);

// POST /:id/imagen - Subir imagen para un producto específico
router.post(
  "/:id/imagen",
  authMiddleware,
  validate({ params: idParamSchema }),
  uploadImage.single("file"),
  resolveProductoTiendaId,
  requireTiendaAccess("editor"),
  uploadImagenForProducto
);

// DELETE - Eliminar producto
router.delete(
  "/:id",
  authMiddleware,
  resolveProductoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  invalidateProductoCacheOnSuccess,
  productosController.delete
);

export default router;
