import { Router } from "express";
import { apiResponse } from "../../utils/apiResponse.js";
import { ValidationError } from "../../utils/errors.js";
import LiveService from "./live.service.js";
import { serializeLivePublic } from "./live.serializer.js";

const liveService = new LiveService();
const router = Router();

// GET / - Estado inicial del live para el storefront (público).
// req.tiendaId lo resuelve resolveTienda (subdominio) o ?tiendaId= como fallback.
// Los cambios en tiempo real (encendido/apagado) llegan por Supabase Realtime;
// este endpoint solo entrega el estado al cargar la página.
router.get("/", async (req, res, next) => {
  try {
    const tiendaId = req.tiendaId || req.query.tiendaId;
    if (!tiendaId) {
      throw new ValidationError("No se pudo resolver la tienda", {
        message: "Falta el identificador de la tienda"
      });
    }
    const row = await liveService.getPublic(tiendaId);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_PUBLIC", data: serializeLivePublic(row) });
  } catch (error) {
    next(error);
  }
});

export default router;
