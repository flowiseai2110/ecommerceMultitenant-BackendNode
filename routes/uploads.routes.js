import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess } from "../middlewares/tienda-access.middleware.js";
import { normalizarImagenWidget } from "../modules/campanas/widget-imagen.js";
import { uploadPublicFile } from "../services/storage.service.js";
import { apiResponse } from "../utils/apiResponse.js";
import { uploadImageSchema, validateFile } from "../validators/uploads.validator.js";
import config from "../config/index.js";

const router = Router();

/**
 * GET /api/v1/uploads/defaults
 * Devuelve las URLs de imágenes por defecto
 */
router.get("/defaults", (_req, res) => {
  return apiResponse(res, {
    status: 200,
    type: "SUCCESS",
    code: "DEFAULT_IMAGES",
    data: config.defaultImages
  });
});

// Configuración de multer (almacenamiento en memoria)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/**
 * POST /api/v1/uploads/image
 * Sube una imagen al almacenamiento público (Supabase o R2, según STORAGE_DRIVER)
 *
 * Body (multipart/form-data):
 * - file: File (imagen)
 * - folder: string ("productos" | "categorias" | "logos" | "banners" | "otros" | "widgets")
 *   widgets: solo PNG/WebP ≤ 1 MB, se guarda como WebP de 512 px (spec campanas-widgets)
 * - tiendaId: string (requerido)
 *
 * Requiere JWT y rol editor (o superior) en esa tienda.
 * Estructura: {tiendaId}/{folder}/{filename}
 */
router.post(
  "/image",
  // Solo miembros de la tienda con rol editor o superior pueden subir a su
  // carpeta. requireTiendaAccess lee req.body.tiendaId, que multer completa
  // al parsear el multipart: por eso va después de upload.single. El admin
  // ya manda el token en todas las llamadas (authInterceptor).
  authMiddleware,
  upload.single("file"),
  requireTiendaAccess("editor"),
  async (req, res) => {
    try {
      // Validar archivo (las reglas dependen de la carpeta)
      const fileValidation = validateFile(req.file, req.body?.folder);
      if (!fileValidation.isValid) {
        return apiResponse(res, {
          status: 400,
          type: "WARNING",
          code: "VALIDATION_ERROR",
          data: { file: fileValidation.errors }
        });
      }

      // Validar body
      const bodyValidation = uploadImageSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiResponse(res, {
          status: 400,
          type: "WARNING",
          code: "VALIDATION_ERROR",
          data: { body: bodyValidation.error.flatten().fieldErrors }
        });
      }

      const { folder, tiendaId } = bodyValidation.data;
      let file = req.file;

      // Widgets: se verifica el contenido real (no el mimetype) y se
      // normaliza a WebP de 512 px con transparencia (R5.2, R5.3).
      if (folder === "widgets") {
        const buffer = await normalizarImagenWidget(file.buffer);
        file = { ...file, buffer, size: buffer.length, mimetype: "image/webp", originalname: "widget.webp" };
      }

      // Generar nombre único para el archivo
      const fileExtension = file.originalname.split(".").pop();
      const uniqueId = crypto.randomUUID();
      const filename = `${uniqueId}.${fileExtension}`;

      // Construir path: {tiendaId}/{folder}/{filename}
      const path = `${tiendaId}/${folder}/${filename}`;

      let uploaded;
      try {
        uploaded = await uploadPublicFile(path, file.buffer, file.mimetype);
      } catch (error) {
        return apiResponse(res, {
          status: 500,
          type: "ERROR",
          code: "UPLOAD_ERROR",
          data: { message: error.message }
        });
      }

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "IMAGE_UPLOADED",
        data: {
          url: uploaded.url,
          path: path,
          folder: folder,
          filename: filename,
          size: file.size,
          mimetype: file.mimetype
        }
      });

    } catch (error) {
      // Errores de validación (p. ej. un widget que no es PNG/WebP) → 4xx.
      if (error.statusCode && error.statusCode < 500) {
        return apiResponse(res, {
          status: error.statusCode,
          type: "WARNING",
          code: "VALIDATION_ERROR",
          data: { message: error.message }
        });
      }
      return apiResponse(res, {
        status: 500,
        type: "ERROR",
        code: "INTERNAL_ERROR",
        data: { message: "Error al subir imagen" }
      });
    }
  }
);

export default router;
