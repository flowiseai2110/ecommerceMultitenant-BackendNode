import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { latidoInvitado, paginaInvitado } from "./transmisiones.service.js";
import { latidoSchema, tokenParamSchema } from "./transmisiones.schema.js";

/**
 * Página del invitado (R4). Pública: el token firmado del enlace es lo único
 * que da acceso. Sin caché: la etapa cambia con la hora y se registra la conexión.
 */

const router = Router();

router.get("/:token", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const data = await paginaInvitado(req.params.token, req.tiendaId ?? null);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "TRANSMISION_INVITADO", data });
  } catch (error) { next(error); }
});

// Latido cada 30 s (R4.3, R4.4): una sola sesión por enlace, conectados y señal.
router.post("/:token/sesion", validate({ params: tokenParamSchema, body: latidoSchema }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const data = await latidoInvitado(req.params.token, req.tiendaId ?? null, req.body);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "TRANSMISION_SESION", data });
  } catch (error) { next(error); }
});

export default router;
