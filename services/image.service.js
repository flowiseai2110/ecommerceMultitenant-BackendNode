import crypto from "crypto";
import sharp from "sharp";
import { supabase } from "../config/supabase.js";
import { uploadPublicFile } from "./storage.service.js";

// Dimensiones por defecto según el tipo de ajuste
const DEFAULT_DIMENSIONS = {
  cover:   { width: 800,  height: 800 },
  contain: { width: 200,  height: 200 },
  fill:    { width: 800,  height: 800 },
  inside:  { width: 800,  height: 800 },
  outside: { width: 800,  height: 800 },
};

/**
 * Procesa una imagen con Sharp (en memoria) y la sube al almacenamiento público
 * (Supabase o R2, según STORAGE_DRIVER) como WebP (calidad 82), con las
 * dimensiones y ajuste indicados. Ya no se genera copia JPEG:
 * todos los navegadores soportados aceptan WebP y duplicaba el almacenamiento.
 *
 * @param {Buffer} buffer    - Buffer de la imagen original
 * @param {string} filename  - Nombre base para construir el path en Storage
 * @param {object} options
 * @param {string}  options.fit    - Tipo de ajuste Sharp (requerido): cover | contain | fill | inside | outside
 * @param {string} [options.folder] - Carpeta dentro del bucket, ej. {tiendaId}/productos
 * @param {number} [options.width]  - Ancho en píxeles (default según fit)
 * @param {number} [options.height] - Alto en píxeles (default según fit)
 * @returns {{ webp: { url, path } }}
 */
export async function processAndUploadImage(buffer, filename, { fit, folder = "", width, height } = {}) {
  if (!fit || !DEFAULT_DIMENSIONS[fit]) {
    throw new Error(`fit es requerido. Valores permitidos: ${Object.keys(DEFAULT_DIMENSIONS).join(", ")}.`);
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

  let webpBuffer;

  try {
    webpBuffer = await sharp(buffer)
      .resize(resolvedWidth, resolvedHeight, { fit, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    throw new Error(`Sharp no pudo procesar la imagen: ${err.message}`);
  }

  const webp = await uploadPublicFile(webpPath, webpBuffer, "image/webp");

  return { webp };
}

/**
 * Elimina archivos de un bucket de Supabase Storage (best-effort, no lanza si falla).
 * Solo para buckets privados/temporales (scratch de Studio); los assets públicos
 * se borran con deletePublicFiles de storage.service.js.
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
