import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validation.middleware.js";
import { requirePlatformAdmin } from "../../middlewares/platform-admin.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { cambiarParametro, listarParametros } from "./parametros.service.js";

/**
 * Parámetros de la plataforma (modules/parametros): solo el administrador de la
 * plataforma (PLATFORM_ADMIN_EMAILS). El valor lo valida el registro de cada
 * parámetro, no esta ruta.
 *   GET /admin/parametros         → todos, con su descripción y quién los cambió
 *   PUT /admin/parametros/:clave  → { valor }
 */

const router = Router();
const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

const claveParams = z.object({ clave: z.string().min(1).max(60).regex(/^[a-z0-9_.]+$/, "Clave inválida") });
const valorBody = z.object({ valor: z.unknown() }).refine(b => b.valor !== undefined, { message: "Falta el valor", path: ["valor"] });

router.get("/", requirePlatformAdmin, async (_req, res) => {
  return ok(res, "PARAMETROS_LIST", await listarParametros());
});

router.put("/:clave", requirePlatformAdmin, validate({ params: claveParams, body: valorBody }), async (req, res) => {
  return ok(res, "PARAMETRO_UPDATED", await cambiarParametro(req.params.clave, req.body.valor, req.user));
});

export default router;
