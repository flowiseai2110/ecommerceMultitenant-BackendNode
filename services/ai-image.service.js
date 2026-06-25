import config from "../config/index.js";
import { InternalError, ValidationError } from "../utils/errors.js";

const NANO_BANANA_EDIT_MODEL = "google/nano-banana-edit";

export const DEFAULT_PRODUCT_PHOTO_PROMPT =
  "Fondo blanco puro, iluminación de estudio uniforme, sombra suave y realista, " +
  "producto centrado y enfocado con alta nitidez. No alteres la forma, el color " +
  "ni el diseño del producto.";

async function kieRequest(path, options = {}) {
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

/**
 * Crea una tarea de edición de imagen con Nano Banana (Gemini 2.5 Flash Image).
 * @param {object} params
 * @param {string} params.imageUrl - URL pública de la imagen origen
 * @param {string} [params.prompt] - Instrucción de edición
 * @returns {Promise<{ taskId: string }>}
 */
export async function createNanoBananaEditTask({ imageUrl, prompt }) {
  if (!imageUrl) throw new ValidationError("Se requiere la URL de la imagen origen");

  const json = await kieRequest("/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({
      model: NANO_BANANA_EDIT_MODEL,
      input: {
        prompt: prompt || DEFAULT_PRODUCT_PHOTO_PROMPT,
        image_urls: [imageUrl],
        output_format: "png"
      }
    })
  });

  return { taskId: json.data.taskId };
}

/**
 * Consulta el estado de una tarea de Kie.ai.
 * @param {string} taskId
 * @returns {Promise<{ taskId: string, state: string, resultUrls: string[], failMsg: string|null }>}
 */
export async function getTaskStatus(taskId) {
  if (!taskId) throw new ValidationError("Se requiere el taskId");

  const json = await kieRequest(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
  const { state, failMsg, resultJson } = json.data;

  let resultUrls = [];
  if (resultJson) {
    try {
      resultUrls = JSON.parse(resultJson).resultUrls || [];
    } catch {
      resultUrls = [];
    }
  }

  return { taskId, state, resultUrls, failMsg: failMsg || null };
}

export default { createNanoBananaEditTask, getTaskStatus, DEFAULT_PRODUCT_PHOTO_PROMPT };
