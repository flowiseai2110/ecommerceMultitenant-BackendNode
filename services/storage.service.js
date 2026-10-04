import { S3Client, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { supabase } from "../config/supabase.js";
import config from "../config/index.js";

/**
 * Almacenamiento PÚBLICO de assets de tienda: catálogo, logos, banners, QR y
 * widgets. El driver se elige con STORAGE_DRIVER:
 *  - "supabase": bucket "tiendas" de Supabase Storage.
 *  - "r2": Cloudflare R2, servido por su CDN desde R2_PUBLIC_URL.
 *
 * Lo privado o temporal (capturas de reservas, scratch de Studio/IA) NO pasa por
 * acá: sigue en Supabase con URLs firmadas.
 */

// Todo path lleva un UUID propio y nunca se sobrescribe, así que el CDN y el
// navegador pueden cachearlo un año sin revalidar.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

let r2Client;
function r2() {
  if (!r2Client) {
    const { accountId, accessKeyId, secretAccessKey } = config.storage.r2;
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
  }
  return r2Client;
}

const drivers = {
  supabase: {
    async upload(path, buffer, contentType) {
      const { error } = await supabase.storage
        .from(config.storage.supabaseBucket)
        .upload(path, buffer, { contentType, upsert: false });
      if (error) throw new Error(`Error al subir a Supabase Storage: ${error.message}`);
    },
    async remove(paths) {
      const { error } = await supabase.storage.from(config.storage.supabaseBucket).remove(paths);
      if (error) throw new Error(error.message);
    },
    publicUrl(path) {
      return supabase.storage.from(config.storage.supabaseBucket).getPublicUrl(path).data.publicUrl;
    }
  },

  r2: {
    async upload(path, buffer, contentType) {
      try {
        await r2().send(new PutObjectCommand({
          Bucket: config.storage.r2.bucket,
          Key: path,
          Body: buffer,
          ContentType: contentType,
          CacheControl: CACHE_CONTROL
        }));
      } catch (err) {
        throw new Error(`Error al subir a R2: ${err.message}`);
      }
    },
    async remove(paths) {
      const { Errors } = await r2().send(new DeleteObjectsCommand({
        Bucket: config.storage.r2.bucket,
        Delete: { Objects: paths.map((Key) => ({ Key })), Quiet: true }
      }));
      if (Errors?.length) throw new Error(Errors.map((e) => `${e.Key}: ${e.Message}`).join("; "));
    },
    publicUrl(path) {
      return `${config.storage.r2.publicUrl}/${path}`;
    }
  }
};

const driver = () => drivers[config.storage.driver];

/**
 * Sube un archivo público. El path es relativo al bucket: {tiendaId}/{carpeta}/{archivo}.
 * @returns {Promise<{ url: string, path: string }>}
 */
export async function uploadPublicFile(path, buffer, contentType) {
  await driver().upload(path, buffer, contentType);
  return { url: driver().publicUrl(path), path };
}

/**
 * Elimina archivos públicos (best-effort, no lanza si falla).
 * @param {string[]} paths - Paths relativos al bucket
 */
export async function deletePublicFiles(paths) {
  const validos = (paths ?? []).filter(Boolean);
  if (!validos.length) return;
  try {
    await driver().remove(validos);
  } catch (err) {
    console.warn(`[Storage] No se pudieron eliminar archivos: ${err.message}`);
  }
}

/** URL pública de un path del bucket público. */
export function publicUrl(path) {
  return driver().publicUrl(path);
}

/** URL pública de la raíz del bucket, sin barra final. */
export function publicBaseUrl() {
  return driver().publicUrl("").replace(/\/+$/, "");
}
