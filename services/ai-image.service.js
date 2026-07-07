import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import config from "../config/index.js";
import { supabase } from "../config/supabase.js";
import { InternalError, ValidationError } from "../utils/errors.js";

// Sigue en uso por services/ai-studio.service.js (Studio no migró de kie.ai).
export const NANO_BANANA_EDIT_MODEL = "google/nano-banana-edit";

export const DEFAULT_PRODUCT_PHOTO_PROMPT =
  "Fondo blanco puro, iluminación de estudio uniforme, sombra suave y realista, " +
  "producto centrado y enfocado con alta nitidez. No alteres la forma, el color " +
  "ni el diseño del producto.";

/** Usado solo por Studio (services/ai-studio.service.js) — el resto migró a Gemini directo. */
export async function kieRequest(path, options = {}) {
  if (!config.kie.apiKey) {
    throw new InternalError("KIE_API_KEY no está configurado en el servidor");
  }

  const response = await fetch(`${config.kie.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.kie.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || json.code >= 400) {
    throw new InternalError(json?.msg || `Kie.ai respondió con error (HTTP ${response.status})`);
  }

  return json;
}

// ---- Gemini (Nano Banana directo, google/genai) — usado por producto-imagenes ----

const GEMINI_SCRATCH_BUCKET = config.studio.scratchBucket; // reutiliza el bucket temporal de Studio
const GEMINI_TASK_TTL_MS = 15 * 60 * 1000;

let geminiClient = null;
function getGeminiClient() {
  if (!config.gemini.apiKey) {
    throw new InternalError("GEMINI_API_KEY no está configurado en el servidor");
  }
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return geminiClient;
}

let scratchBucketReady = null;
async function ensureScratchBucket() {
  if (scratchBucketReady) return scratchBucketReady;
  scratchBucketReady = (async () => {
    try {
      const { error } = await supabase.storage.createBucket(GEMINI_SCRATCH_BUCKET, { public: false });
      if (error && !/already exists/i.test(error.message || "")) {
        throw new InternalError(`No se pudo preparar el bucket temporal de IA: ${error.message}`);
      }
    } catch (err) {
      scratchBucketReady = null;
      throw err;
    }
  })();
  return scratchBucketReady;
}

async function uploadResultToScratch(buffer, taskId) {
  await ensureScratchBucket();

  const path = `${taskId}_result.png`;
  const { error: uploadError } = await supabase.storage
    .from(GEMINI_SCRATCH_BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: false });
  if (uploadError) {
    throw new InternalError(`No se pudo subir el resultado temporal de la IA: ${uploadError.message}`);
  }

  const { data, error: signError } = await supabase.storage
    .from(GEMINI_SCRATCH_BUCKET)
    .createSignedUrl(path, GEMINI_TASK_TTL_MS / 1000);
  if (signError) {
    throw new InternalError(`No se pudo generar la URL temporal de la IA: ${signError.message}`);
  }

  return { path, url: data.signedUrl };
}

// taskId -> { state, resultUrls, failMsg, scratchPath, createdAt }
// La llamada a Gemini es síncrona; este mapa solo preserva el contrato taskId +
// polling que ya usaba el controller/frontend, para no tener que tocarlos.
const geminiTasks = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [taskId, task] of geminiTasks) {
    if (now - task.createdAt <= GEMINI_TASK_TTL_MS) continue;
    geminiTasks.delete(taskId);
    if (task.scratchPath) {
      supabase.storage.from(GEMINI_SCRATCH_BUCKET).remove([task.scratchPath]).catch(() => {});
    }
  }
}, 5 * 60 * 1000);

/**
 * Edita una imagen con Nano Banana (Gemini 2.5 Flash Image) llamando directo a la API de Google.
 * @param {object} params
 * @param {string} params.imageUrl - URL pública de la imagen origen
 * @param {string} [params.prompt] - Instrucción de edición
 * @returns {Promise<{ taskId: string }>}
 */
export async function createNanoBananaEditTask({ imageUrl, prompt }) {
  if (!imageUrl) throw new ValidationError("Se requiere la URL de la imagen origen");

  const taskId = crypto.randomUUID();
  let record;

  try {
    const sourceRes = await fetch(imageUrl);
    if (!sourceRes.ok) throw new Error("No se pudo descargar la imagen origen");
    const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());
    const sourceMimeType = sourceRes.headers.get("content-type") || "image/png";

    const response = await getGeminiClient().models.generateContent({
      model: config.gemini.imageModel,
      contents: [
        { text: prompt || DEFAULT_PRODUCT_PHOTO_PROMPT },
        { inlineData: { mimeType: sourceMimeType, data: sourceBuffer.toString("base64") } }
      ]
    });

    const imagePart = (response.candidates?.[0]?.content?.parts || [])
      .find(part => part.inlineData?.data);
    if (!imagePart) throw new Error("La IA no devolvió ninguna imagen");

    const resultBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const { path, url } = await uploadResultToScratch(resultBuffer, taskId);

    record = { state: "success", resultUrls: [url], failMsg: null, scratchPath: path, createdAt: Date.now() };
  } catch (err) {
    record = { state: "fail", resultUrls: [], failMsg: err.message, scratchPath: null, createdAt: Date.now() };
  }

  geminiTasks.set(taskId, record);
  return { taskId };
}

/**
 * Consulta el estado de una tarea de edición con Gemini. La llamada ya se
 * resolvió de forma síncrona en createNanoBananaEditTask; esto solo lee el
 * resultado guardado en memoria.
 * @param {string} taskId
 * @returns {Promise<{ taskId: string, state: string, resultUrls: string[], failMsg: string|null }>}
 */
export async function getTaskStatus(taskId) {
  if (!taskId) throw new ValidationError("Se requiere el taskId");

  const task = geminiTasks.get(taskId);
  if (!task) {
    return { taskId, state: "fail", resultUrls: [], failMsg: "Tarea no encontrada o expirada" };
  }

  return { taskId, state: task.state, resultUrls: task.resultUrls, failMsg: task.failMsg };
}

export default { createNanoBananaEditTask, getTaskStatus, DEFAULT_PRODUCT_PHOTO_PROMPT };
