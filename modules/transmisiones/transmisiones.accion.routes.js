import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { accionExtender, accionInfo, accionTerminarALaHora } from "./transmisiones.service.js";
import { accionExtenderSchema, tokenParamSchema } from "./transmisiones.schema.js";

/**
 * Enlace del aviso de los 15 minutos (R7.5). Público: el token firmado del
 * correo es lo único que da acceso, y vence media hora después del corte.
 * Lo abre el dueño o el contacto de la transmisión, sin iniciar sesión.
 * GET solo informa: un lector de correo que precarga el enlace no extiende nada.
 */

const router = Router();
const ok = (res, code, data) => {
  res.set("Cache-Control", "no-store");
  return apiResponse(res, { status: 200, type: "SUCCESS", code, data });
};

router.get("/:token", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try { return ok(res, "TRANSMISION_ACCION", await accionInfo(req.params.token)); } catch (error) { next(error); }
});

router.post("/:token/extender", validate({ params: tokenParamSchema, body: accionExtenderSchema }), async (req, res, next) => {
  try { return ok(res, "TRANSMISION_EXTENDIDA", await accionExtender(req.params.token, req.body.minutos)); } catch (error) { next(error); }
});

router.post("/:token/terminar-a-la-hora", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try { return ok(res, "TRANSMISION_SIN_EXTENSION", await accionTerminarALaHora(req.params.token)); } catch (error) { next(error); }
});

export default router;
