import crypto from "crypto";
import sharp from "sharp";
import config from "../config/index.js";
import { supabase } from "../config/supabase.js";
import { deleteFromStorage } from "./image.service.js";
import { kieRequest, NANO_BANANA_EDIT_MODEL } from "./ai-image.service.js";
import { InternalError, NotFoundError, ValidationError } from "../utils/errors.js";

const SCRATCH_BUCKET = config.studio.scratchBucket;
const SCRATCH_TTL_MS = 15 * 60 * 1000; // las URLs firmadas y los archivos scratch viven 15 min
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Dimensiones objetivo por tipo — la IA recibe un hint de proporción y el
// resultado se recorta/ajusta exactamente a estas medidas antes de entregarlo.
const TIPO_DIMENSIONS = {
  logo: { width: 200, height: 60, ratioLabel: "3.33:1 horizontal (logo)" },
  banner: { width: 1440, height: 520, ratioLabel: "2.77:1 horizontal (banner web)" },
  producto: { width: 800, height: 800, ratioLabel: "1:1 cuadrado (foto de producto)" }
};

// taskId (de Kie.ai) -> { tipo, scratchPaths, localResult, createdAt }
// Cache en memoria: evita reprocesar/resubir en cada poll y permite hacer
// limpieza por TTL sin depender de una tabla ni de un servicio de colas.
const tasks = new Map();

// path en el bucket scratch -> timestamp de expiración
const scratchRegistry = new Map();

let scratchBucketReady = null;
async function ensureScratchBucket() {
  if (scratchBucketReady) return scratchBucketReady;
  scratchBucketReady = (async () => {
    try {
      const { error } = await supabase.storage.createBucket(SCRATCH_BUCKET, { public: false });
      if (error && !/already exists/i.test(error.message || "")) {
        throw new InternalError(`No se pudo preparar el bucket temporal de Studio: ${error.message}`);
      }
    } catch (err) {
      scratchBucketReady = null;
      throw err;
    }
  })();
  return scratchBucketReady;
}

async function uploadToScratch(buffer, baseName, contentType) {
  await ensureScratchBucket();

  const safeName = baseName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${crypto.randomUUID()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(SCRATCH_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (uploadError) {
    throw new InternalError(`No se pudo subir el archivo temporal de Studio: ${uploadError.message}`);
  }

  const { data, error: signError } = await supabase.storage
    .from(SCRATCH_BUCKET)
    .createSignedUrl(path, SCRATCH_TTL_MS / 1000);
  if (signError) {
    throw new InternalError(`No se pudo generar la URL temporal de Studio: ${signError.message}`);
  }

  scratchRegistry.set(path, Date.now() + SCRATCH_TTL_MS);
  return { path, url: data.signedUrl };
}

async function cleanupScratchPaths(paths = []) {
  if (!paths.length) return;
  await deleteFromStorage(paths, SCRATCH_BUCKET);
  for (const path of paths) scratchRegistry.delete(path);
}

setInterval(async () => {
  const now = Date.now();

  const expiredPaths = [...scratchRegistry.entries()]
    .filter(([, expiresAt]) => expiresAt <= now)
    .map(([path]) => path);
  if (expiredPaths.length) await cleanupScratchPaths(expiredPaths);

  for (const [taskId, record] of tasks) {
    if (now - record.createdAt > SCRATCH_TTL_MS) tasks.delete(taskId);
  }
}, SWEEP_INTERVAL_MS);

/**
 * Crea una tarea de generación/mezcla de imagen con IA para Studio.
 * Las imágenes de entrada se suben a un bucket scratch (temporal, con TTL)
 * solo para que Kie.ai pueda descargarlas por URL — nunca al bucket de tienda.
 *
 * @param {object} params
 * @param {"logo"|"banner"|"producto"} params.tipo
 * @param {string} params.prompt
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }} params.imagenBase
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }|null} params.imagenMezcla
 * @returns {Promise<{ taskId: string }>}
 */
export async function createStudioTask({ tipo, prompt, imagenBase, imagenMezcla }) {
  if (!imagenBase) throw new ValidationError("Se requiere la imagen base");

  const dimensions = TIPO_DIMENSIONS[tipo];
  if (!dimensions) throw new ValidationError(`tipo debe ser uno de: ${Object.keys(TIPO_DIMENSIONS).join(", ")}`);

  const baseUpload = await uploadToScratch(imagenBase.buffer, imagenBase.originalname || "base", imagenBase.mimetype);
  const scratchPaths = [baseUpload.path];
  const imageUrls = [baseUpload.url];

  if (imagenMezcla) {
    const mezclaUpload = await uploadToScratch(imagenMezcla.buffer, imagenMezcla.originalname || "mezcla", imagenMezcla.mimetype);
    scratchPaths.push(mezclaUpload.path);
    imageUrls.push(mezclaUpload.url);
  }

  const { width, height, ratioLabel } = dimensions;
  const augmentedPrompt =
    `${prompt}\n\nGenera el resultado en proporción ${ratioLabel}, encuadre aproximado ${width}x${height}px, ` +
    "sin recortar elementos importantes de la composición.";

  let taskId;
  try {
    const json = await kieRequest("/jobs/createTask", {
      method: "POST",
      body: JSON.stringify({
        model: NANO_BANANA_EDIT_MODEL,
        input: {
          prompt: augmentedPrompt,
          image_urls: imageUrls,
          output_format: "png"
        }
      })
    });
    taskId = json.data.taskId;
  } catch (err) {
    await cleanupScratchPaths(scratchPaths);
    throw err;
  }

  tasks.set(taskId, { tipo, scratchPaths, localResult: null, createdAt: Date.now() });

  return { taskId };
}

/**
 * Consulta el estado de una tarea de Studio (polling, sin efectos secundarios
 * salvo el post-procesamiento perezoso del resultado la primera vez que se
 * detecta éxito en Kie.ai).
 * @param {string} taskId
 * @returns {Promise<{ taskId, state, resultUrl: string|null, failMsg: string|null }>}
 */
export async function getStudioTaskStatus(taskId) {
  const record = tasks.get(taskId);
  if (!record) throw new NotFoundError("Tarea de Studio", "Tarea de Studio no encontrada o expirada");

  if (record.localResult) {
    return { taskId, ...record.localResult };
  }

  const kieStatus = await kieRequest(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
  const { state, failMsg, resultJson } = kieStatus.data;

  if (state === "fail") {
    record.localResult = { state: "fail", resultUrl: null, failMsg: failMsg || "La generación falló" };
    await cleanupScratchPaths(record.scratchPaths);
    return { taskId, ...record.localResult };
  }

  if (state !== "success") {
    return { taskId, state, resultUrl: null, failMsg: null };
  }

  let resultUrls = [];
  if (resultJson) {
    try {
      resultUrls = JSON.parse(resultJson).resultUrls || [];
    } catch {
      resultUrls = [];
    }
  }

  try {
    const sourceUrl = resultUrls[0];
    if (!sourceUrl) throw new Error("La IA no devolvió ninguna imagen");

    const downloaded = await fetch(sourceUrl);
    if (!downloaded.ok) throw new Error("No se pudo descargar la imagen generada por la IA");
    const buffer = Buffer.from(await downloaded.arrayBuffer());

    const { width, height } = TIPO_DIMENSIONS[record.tipo];
    const resized = await sharp(buffer)
      .resize(width, height, { fit: "cover", withoutEnlargement: false })
      .png()
      .toBuffer();

    const resultUpload = await uploadToScratch(resized, `result_${taskId}.png`, "image/png");

    record.localResult = { state: "success", resultUrl: resultUpload.url, failMsg: null };
    await cleanupScratchPaths(record.scratchPaths);
    return { taskId, ...record.localResult };
  } catch (err) {
    record.localResult = { state: "fail", resultUrl: null, failMsg: err.message };
    return { taskId, ...record.localResult };
  }
}

export default { createStudioTask, getStudioTaskStatus };
