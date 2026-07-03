import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import { generarStudio, consultarEstadoStudio } from "../controllers/studio.controller.js";
import { generarStudioSchema, studioTaskIdParamSchema } from "../validators/studio.validator.js";

const uploadStudioImages = uploadImage.fields([
  { name: "imagenBase", maxCount: 1 },
  { name: "imagenMezcla", maxCount: 1 }
]);

const router = Router();

// ============================================
// STUDIO — generación libre de imágenes con IA (sin tenant, sin persistencia)
// ============================================

// POST - Encola una tarea de generación con IA a partir de imágenes recibidas en el body
router.post(
  "/generar-ia",
  authMiddleware,
  uploadStudioImages,
  validate({ body: generarStudioSchema }),
  generarStudio
);

// GET - Consulta el estado de la tarea (polling, sin efectos secundarios de negocio)
router.get(
  "/generar-ia/:taskId",
  authMiddleware,
  validate({ params: studioTaskIdParamSchema }),
  consultarEstadoStudio
);

export default router;
