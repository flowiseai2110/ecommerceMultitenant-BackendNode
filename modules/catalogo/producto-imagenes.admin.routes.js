import { uploadImage } from "../../middlewares/upload.middleware.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, findActiveMembership } from "../../kernel/tenant/index.js";
import { crearCrud, tiendaDelPadre } from "../../kernel/crud/crear-crud.js";
import { POLITICAS } from "../../kernel/crud/politicas.js";
import { makeUploadImagen, deleteImagenWithCleanup } from "../../controllers/producto-imagenes.controller.js";
import {
  generarImagenIA,
  consultarEstadoImagenIA,
  confirmarImagenIA
} from "../../controllers/ai-imagen.controller.js";
import { getTaskTiendaId } from "../../services/ai-image.service.js";
import { ForbiddenError } from "../../utils/errors.js";
import {
  createImagenSchema,
  updateImagenSchema,
  idParamSchema,
  paginationSchema,
  generarIaSchema,
  confirmarIaSchema,
  taskIdParamSchema
} from "./producto-imagenes.schema.js";
import { serializeImagenAdmin } from "./producto-imagenes.serializer.js";

const uploadImagen = makeUploadImagen();

// Imágenes de producto (Admin). producto_imagenes no tiene tiendaId propio: la
// tienda dueña es la del producto (al crear o subir, la del productoId del body).
// El CRUD lo arma la política (kernel/crud, docs/specs/antipatrones A7); el
// borrado usa su propio handler porque también limpia los archivos del storage.
const imagenes = crearCrud({
  modelo: prisma.producto_imagenes,
  nombre: "ProductoImagen",
  politica: POLITICAS.adminTienda,
  serializer: serializeImagenAdmin,
  schemas: { listado: paginationSchema, id: idParamSchema, crear: createImagenSchema, editar: updateImagenSchema },
  tienda: tiendaDelPadre({ relacion: "producto", campo: "productoId", modelo: prisma.productos, nombre: "Producto" }),
  servicio: {
    allowedFilters: ["productoId", "esPrincipal"],
    allowedOrderBy: ["orden", "fechaRegistro"]
  },
  acciones: { borrar: deleteImagenWithCleanup }
});

const router = imagenes.router;

// Las rutas que no son CRUD usan el mismo acceso de la política: la tienda dueña
// real (de la imagen, o del producto destino) y el rol en ella.

// POST /upload - Subir archivo + procesar con Sharp + guardar en DB
// multer corre primero para poblar req.body y req.file antes de resolver la tienda
router.post(
  "/upload",
  authMiddleware,
  uploadImage.single("file"),
  ...imagenes.acceso("editor", "padre"),
  uploadImagen
);

// ============================================
// GENERACIÓN DE IMAGEN CON IA (Nano Banana vía Gemini directo)
// ============================================

// POST - Inicia la edición con IA de una imagen ya subida (:id = imagen origen)
router.post(
  "/:id/generar-ia",
  authMiddleware,
  ...imagenes.acceso("editor", "registro"),
  validate({ params: idParamSchema, body: generarIaSchema }),
  generarImagenIA
);

// Protege el polling de estado: si la tarea existe, exige que el usuario
// tenga membresía (cualquier rol) en la tienda dueña de esa tarea — grabada
// en generarImagenIA. Si la tarea no existe o expiró (TTL de 15 min), no
// bloquea: el controller ya devuelve un estado "fail" con mensaje genérico
// sin filtrar ningún dato, así que no hay nada que proteger en ese caso.
async function requireIaTaskAccess(req, res, next) {
  const tiendaId = getTaskTiendaId(req.params.taskId);
  if (!tiendaId) return next();

  const membership = await findActiveMembership(req.user.id, tiendaId);
  if (!membership) return next(new ForbiddenError("No tienes acceso a esta tarea de IA"));

  next();
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
  ...imagenes.acceso("editor", "padre"),
  validate({ params: taskIdParamSchema, body: confirmarIaSchema }),
  confirmarImagenIA
);

export default router;
