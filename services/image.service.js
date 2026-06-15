import crypto from "crypto";
import sharp from "sharp";
import { supabase } from "../config/supabase.js";

// Dimensiones por defecto según el tipo de ajuste
const DEFAULT_DIMENSIONS = {
  cover:   { width: 800,  height: 800 },
  contain: { width: 200,  height: 200 },
  fill:    { width: 800,  height: 800 },
  inside:  { width: 800,  height: 800 },
  outside: { width: 800,  height: 800 },
};

/**
 * Procesa una imagen con Sharp (en memoria) y sube dos versiones a Supabase Storage:
 * WebP (calidad 82) y JPEG (calidad 85), con las dimensiones y ajuste indicados.
 *
 * @param {Buffer} buffer    - Buffer de la imagen original
 * @param {string} filename  - Nombre base para construir el path en Storage
 * @param {object} options
 * @param {string}  options.fit    - Tipo de ajuste Sharp (requerido): cover | contain | fill | inside | outside
 * @param {string}  options.bucket - Bucket de Supabase Storage (requerido)
 * @param {number} [options.width]  - Ancho en píxeles (default según fit)
 * @param {number} [options.height] - Alto en píxeles (default según fit)
 * @returns {{ webp: { url, path }, jpeg: { url, path } }}
 */
export async function processAndUploadImage(buffer, filename, { fit, bucket, folder = "", width, height } = {}) {
  if (!fit || !DEFAULT_DIMENSIONS[fit]) {
    throw new Error(`fit es requerido. Valores permitidos: ${Object.keys(DEFAULT_DIMENSIONS).join(", ")}.`);
  }
  if (!bucket) {
    throw new Error("bucket es requerido.");
  }

  const resolvedWidth  = width  ?? DEFAULT_DIMENSIONS[fit].width;
  const resolvedHeight = height ?? DEFAULT_DIMENSIONS[fit].height;

  if (!Number.isInteger(resolvedWidth)  || resolvedWidth  < 1 || resolvedWidth  > 5000) {
    throw new Error(`Ancho inválido: ${resolvedWidth}. Debe ser un entero entre 1 y 5000.`);
  }
  if (!Number.isInteger(resolvedHeight) || resolvedHeight < 1 || resolvedHeight > 5000) {
    throw new Error(`Alto inválido: ${resolvedHeight}. Debe ser un entero entre 1 y 5000.`);
  }

  const baseName = filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const uid = crypto.randomUUID();
  const prefix = folder ? `${folder}/` : "";
  const webpPath = `${prefix}${uid}_${baseName}.webp`;
  const jpegPath = `${prefix}${uid}_${baseName}.jpg`;

  let webpBuffer, jpegBuffer;

  try {
    [webpBuffer, jpegBuffer] = await Promise.all([
      sharp(buffer)
        .resize(resolvedWidth, resolvedHeight, { fit, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
      sharp(buffer)
        .resize(resolvedWidth, resolvedHeight, { fit, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);
  } catch (err) {
    throw new Error(`Sharp no pudo procesar la imagen: ${err.message}`);
  }

  const [webpResult, jpegResult] = await Promise.all([
    supabase.storage.from(bucket).upload(webpPath, webpBuffer, {
      contentType: "image/webp",
      upsert: false,
    }),
    supabase.storage.from(bucket).upload(jpegPath, jpegBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    }),
  ]);

  if (webpResult.error) {
    throw new Error(`Error al subir WebP a Supabase Storage: ${webpResult.error.message}`);
  }
  if (jpegResult.error) {
    throw new Error(`Error al subir JPEG a Supabase Storage: ${jpegResult.error.message}`);
  }

  const { data: webpUrlData } = supabase.storage.from(bucket).getPublicUrl(webpPath);
  const { data: jpegUrlData } = supabase.storage.from(bucket).getPublicUrl(jpegPath);

  return {
    webp: { url: webpUrlData.publicUrl, path: webpPath },
    jpeg: { url: jpegUrlData.publicUrl, path: jpegPath },
  };
}

/**
 * Elimina archivos de Supabase Storage (best-effort, no lanza si falla).
 * @param {string[]} paths - Paths dentro del bucket a eliminar
 * @param {string}   bucket - Nombre del bucket
 */
export async function deleteFromStorage(paths, bucket) {
  if (!paths?.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.warn(`[Storage] No se pudieron eliminar archivos: ${error.message}`);
  }
}
