import { Readable } from "node:stream";
import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/index.js";

/**
 * Archivos PRIVADOS en Cloudflare R2 (hoy: el MP4 de las grabaciones con
 * "Guardar 1 año", docs/specs/transmision-eventos Fase 4). Usa las mismas
 * credenciales R2_* que storage.service.js, pero otro bucket
 * (R2_BUCKET_GRABACIONES) SIN dominio público: solo se baja con URL firmada.
 */

let cliente = null;

function r2() {
  const { accountId, accessKeyId, secretAccessKey } = config.storage.r2;
  const bucket = config.transmisiones.bucketGrabaciones;
  const faltan = [
    !accountId && "R2_ACCOUNT_ID", !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY", !bucket && "R2_BUCKET_GRABACIONES"
  ].filter(Boolean);
  if (faltan.length) throw new Error(`R2 privado sin configurar: ${faltan.join(", ")}`);
  cliente ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
  return { cliente, bucket };
}

/**
 * Sube un archivo grande sin cargarlo en memoria (multipart de 32 MB).
 * @param {string} key
 * @param {ReadableStream|Readable} cuerpo - el body de un fetch o un stream de Node
 * @returns {Promise<void>}
 */
export async function subirPrivado(key, cuerpo, contentType = "application/octet-stream") {
  const { cliente: c, bucket } = r2();
  const body = cuerpo instanceof Readable ? cuerpo : Readable.fromWeb(cuerpo);
  await new Upload({
    client: c,
    params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
    partSize: 32 * 1024 * 1024,
    queueSize: 2
  }).done();
}

/** URL firmada de descarga (por defecto 1 h), con el nombre de archivo que verá quien descarga. */
export async function urlPrivada(key, { segundos = 3600, nombreArchivo } = {}) {
  const { cliente: c, bucket } = r2();
  return getSignedUrl(c, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(nombreArchivo ? { ResponseContentDisposition: `attachment; filename="${nombreArchivo.replace(/"/g, "")}"` } : {})
  }), { expiresIn: segundos });
}

/** Borra un objeto. Idempotente: R2 responde bien aunque no exista. */
export async function borrarPrivado(key) {
  const { cliente: c, bucket } = r2();
  await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
