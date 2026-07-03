import { createStudioTask, getStudioTaskStatus } from "../services/ai-studio.service.js";
import { generarStudioSchema } from "../validators/studio.validator.js";
import { apiResponse } from "../utils/apiResponse.js";
import { ValidationError } from "../utils/errors.js";

// POST /admin/studio/generar-ia — recibe imagenBase (+ imagenMezcla opcional) por multipart
export async function generarStudio(req, res, next) {
  try {
    const parsed = generarStudioSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message);

    const imagenBase = req.files?.imagenBase?.[0];
    if (!imagenBase) throw new ValidationError("Se requiere la imagen base");
    const imagenMezcla = req.files?.imagenMezcla?.[0] || null;

    const { tipo, prompt } = parsed.data;
    const { taskId } = await createStudioTask({ tipo, prompt, imagenBase, imagenMezcla });

    return apiResponse(res, { status: 201, type: "success", code: "STUDIO_TASK_CREATED", data: { taskId } });
  } catch (err) {
    next(err);
  }
}

// GET /admin/studio/generar-ia/:taskId — polling de estado, sin persistencia de resultado
export async function consultarEstadoStudio(req, res, next) {
  try {
    const { taskId } = req.params;
    const status = await getStudioTaskStatus(taskId);
    return apiResponse(res, { status: 200, type: "success", code: "STUDIO_TASK_STATUS", data: status });
  } catch (err) {
    next(err);
  }
}
