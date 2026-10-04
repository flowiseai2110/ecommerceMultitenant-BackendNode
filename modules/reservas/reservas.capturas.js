import crypto from "crypto";
import multer from "multer";
import { supabase } from "../../config/supabase.js";
import config from "../../config/index.js";
import { InternalError, ValidationError } from "../../utils/errors.js";

/**
 * Capturas del pago manual (Yape / Plin / transferencia), spec R7.2 y R7.7.
 * Van a un bucket PRIVADO: solo el backend sube y genera URLs firmadas de
 * corta duración para el negocio y para el titular de la reserva.
 */

export const MAX_BYTES = 5 * 1024 * 1024;
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const URL_TTL_SEG = 10 * 60;

export const uploadCaptura = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!MIME_EXT[file.mimetype]) {
      return cb(new ValidationError("Sube una imagen (JPG, PNG, WEBP) o un PDF", { message: "Sube una imagen (JPG, PNG, WEBP) o un PDF" }));
    }
    cb(null, true);
  }
}).single("captura");

/**
 * @param {{ tiendaId: string, pedidoId: string, file: { buffer: Buffer, mimetype: string } }} p
 * @returns {Promise<string>} path dentro del bucket
 */
export async function subirCaptura({ tiendaId, pedidoId, file }) {
  if (!file?.buffer?.length) throw new ValidationError("Adjunta la captura de tu pago", { message: "Adjunta la captura de tu pago" });
  const ext = MIME_EXT[file.mimetype];
  if (!ext) throw new ValidationError("Sube una imagen (JPG, PNG, WEBP) o un PDF", { message: "Sube una imagen (JPG, PNG, WEBP) o un PDF" });

  const path = `${tiendaId}/${pedidoId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(config.reservas.bucketCapturas)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw new InternalError(`No se pudo guardar la captura: ${error.message}`);
  return path;
}

/** URL firmada de lectura (10 min). null si no hay captura o falla la firma. */
export async function urlCaptura(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(config.reservas.bucketCapturas)
    .createSignedUrl(path, URL_TTL_SEG);
  return error ? null : data.signedUrl;
}
