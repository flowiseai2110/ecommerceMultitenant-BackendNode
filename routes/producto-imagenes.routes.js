import { Router } from "express";
import { uploadImage } from "../middlewares/upload.middleware.js";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId, scopeReadToResourceTienda } from "../middlewares/tienda-access.middleware.js";
import { makeUploadImagen, deleteImagenWithCleanup } from "../controllers/producto-imagenes.controller.js";
import {
  generarImagenIA,
  consultarEstadoImagenIA,
  confirmarImagenIA
} from "../controllers/ai-imagen.controller.js";
import { getTaskTiendaId } from "../services/ai-image.service.js";
import { ForbiddenError } from "../utils/errors.js";
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
// relación producto de la imagen existente (actualización/eliminación/lectura).
const findImagenTiendaId = async (req) => {
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
};

const resolveImagenTiendaId = resolveTiendaId(findImagenTiendaId);

// Para lectura (GET /:id): resuelve el tiendaId dueño SIEMPRE, ignorando
// cualquier tiendaId que venga en query — ver mismo razonamiento en
// productos.routes.js.
const scopeImagenReadToOwner = scopeReadToResourceTienda(findImagenTiendaId);

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
  authMiddleware,
  validate({ params: idParamSchema }),
  scopeImagenReadToOwner,
  requireTiendaAccess("viewer"),
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
// producto_imagenes no tiene tiendaId propio (ver resolveImagenTiendaId), así
// que se limpia para que GenericRepository.update no intente filtrar por una
// columna inexistente. skipExistsCheck evita repetir la consulta de
// existencia: resolveImagenTiendaId ya la hizo para resolver la tienda dueña
// (era un round-trip extra en cada PUT, redundante con el que ya corrió arriba).
router.put(
  "/:id",
  authMiddleware,
  resolveImagenTiendaId,
  requireTiendaAccess("editor"),
  (req, _res, next) => { req.tiendaId = null; req.skipExistsCheck = true; next(); },
  validate({ params: idParamSchema, body: updateImagenSchema }),
  imagenesController.update
);

// ============================================
// GENERACIÓN DE IMAGEN CON IA (Nano Banana vía Gemini directo)
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

// Protege el polling de estado: si la tarea existe, exige que el usuario
// tenga membresía (cualquier rol) en la tienda dueña de esa tarea — grabada
// en generarImagenIA. Si la tarea no existe o expiró (TTL de 15 min), no
// bloquea: el controller ya devuelve un estado "fail" con mensaje genérico
// sin filtrar ningún dato, así que no hay nada que proteger en ese caso.
async function requireIaTaskAccess(req, res, next) {
  try {
    const tiendaId = getTaskTiendaId(req.params.taskId);
    if (!tiendaId) return next();

    const membership = await prisma.usuario_tiendas.findFirst({
      where: { userId: req.user.id, tiendaId, activo: true }
    });
    if (!membership) return next(new ForbiddenError("No tienes acceso a esta tarea de IA"));

    next();
  } catch (error) {
    next(error);
  }
}

// GET - Consulta el estado de la tarea de IA (polling, sin efectos secundarios)
router.get(
  "/generar-ia/:taskId",
  authMiddleware,
  validate({ params: taskIdParamSchema }),
  requireIaTaskAccess,
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
