import { Router } from "express";
import sharp from "sharp";
import { uploadImage } from "../middlewares/upload.middleware.js";

const router = Router();

// POST /api/v1/images/preview
// Procesa la imagen en memoria (400×400 WebP) y devuelve base64.
// No sube nada a Storage — solo para previsualización en el cliente.
router.post("/preview", uploadImage.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 400,
        type: "ERROR",
        code: "VALIDATION_ERROR",
        data: { message: "Se requiere un archivo de imagen" },
      });
    }

    const buffer = await sharp(req.file.buffer)
      .resize(400, 400, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    return res.json({
      previewBase64: `data:image/webp;base64,${buffer.toString("base64")}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
