import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
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

// Nombre del bucket único
const BUCKET_NAME = "tiendas";

/**
 * POST /api/v1/uploads/image
 * Sube una imagen a Supabase Storage
 *
 * Body (multipart/form-data):
 * - file: File (imagen)
 * - folder: string ("productos" | "categorias" | "logos" | "banners" | "otros")
 * - tiendaId: string (requerido)
 *
 * Estructura: tiendas/{tiendaId}/{folder}/{filename}
 */
router.post(
  "/image",
  // authMiddleware, // TODO: Habilitar cuando el frontend envíe el token
  upload.single("file"),
  async (req, res) => {
    try {
      // Validar archivo
      const fileValidation = validateFile(req.file);
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
      const file = req.file;

      // Generar nombre único para el archivo
      const fileExtension = file.originalname.split(".").pop();
      const uniqueId = crypto.randomUUID();
      const filename = `${uniqueId}.${fileExtension}`;

      // Construir path: {tiendaId}/{folder}/{filename}
      const path = `${tiendaId}/${folder}/${filename}`;

      // Subir a Supabase Storage
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) {
        return apiResponse(res, {
          status: 500,
          type: "ERROR",
          code: "UPLOAD_ERROR",
          data: { message: error.message }
        });
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "IMAGE_UPLOADED",
        data: {
          url: urlData.publicUrl,
          path: path,
          folder: folder,
          filename: filename,
          size: file.size,
          mimetype: file.mimetype
        }
      });

    } catch (error) {
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
