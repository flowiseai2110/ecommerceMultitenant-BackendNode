import { Router } from "express";
import { uploadImage } from "../middlewares/upload.middleware.js";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
import { makeUploadImagen, deleteImagenWithCleanup } from "../controllers/producto-imagenes.controller.js";
import {
  generarImagenIA,
  consultarEstadoImagenIA,
  confirmarImagenIA
} from "../controllers/ai-imagen.controller.js";
import {
  createImagenSchema,
  updateImagenSchema,
  idParamSchema,
  paginationSchema,
  generarIaSchema,
  confirmarIaSchema,
  taskIdParamSchema
} from "../validators/producto-imagenes.validator.js";

const uploadImagen = makeUploadImagen("tiendas");


// Crear instancias de las capas
const imagenesRepository = new GenericRepository(prisma.producto_imagenes, "ProductoImagen");
const imagenesService = new GenericService(imagenesRepository, { enableAudit: true });
const imagenesController = new GenericController(imagenesService, "ProductoImagen");

// producto_imagenes no tiene tiendaId propio: la tienda dueña se hereda
// del producto padre. Resolvemos vía productoId (creación) o vía la
// relación producto de la imagen existente (actualización/eliminación).
const resolveImagenTiendaId = resolveTiendaId(async (req) => {
  if (req.body?.productoId) {
    const producto = await prisma.productos.findUnique({
      where: { id: req.body.productoId },
      select: { tiendaId: true }
    });
    return producto?.tiendaId || null;
  }

  const imagen = await prisma.producto_imagenes.findUnique({
    where: { id: req.params.id },
    select: { producto: { select: { tiendaId: true } } }
  });
  return imagen?.producto?.tiendaId || null;
});

const router = Router();

// GET - Listar todas las imágenes
router.get(
  "/",
  validate({ query: paginationSchema }),
  imagenesController.findAll
);

// GET - Obtener imagen por ID
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  imagenesController.findById
);

// POST /upload - Subir archivo + procesar con Sharp + guardar en DB
// multer corre primero para poblar req.body y req.file antes de resolveImagenTiendaId
router.post(
  "/upload",
  authMiddleware,
  uploadImage.single("file"),
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  uploadImagen
);

// POST - Crear imagen con URL ya existente (sin procesamiento)
router.post(
  "/",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  validate({ body: createImagenSchema }),
  imagenesController.create
);

// PUT - Actualizar imagen
router.put(
  "/:id",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  (req, _res, next) => { req.tiendaId = null; next(); },
  validate({ params: idParamSchema, body: updateImagenSchema }),
  imagenesController.update
);

// ============================================
// GENERACIÓN DE IMAGEN CON IA (Nano Banana vía Kie.ai)
// ============================================

// POST - Inicia la edición con IA de una imagen ya subida (:id = imagen origen)
router.post(
  "/:id/generar-ia",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: generarIaSchema }),
  generarImagenIA
);

// GET - Consulta el estado de la tarea de IA (polling, sin efectos secundarios)
router.get(
  "/generar-ia/:taskId",
  authMiddleware,
  validate({ params: taskIdParamSchema }),
  consultarEstadoImagenIA
);

// POST - Confirma el resultado de la IA y lo persiste como imagen real del producto
router.post(
  "/generar-ia/:taskId/confirmar",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: taskIdParamSchema, body: confirmarIaSchema }),
  confirmarImagenIA
);

// DELETE - Eliminar imagen y limpiar archivos de Supabase Storage
router.delete(
  "/:id",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  deleteImagenWithCleanup
);

export default router;
