import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import LiveService from "./live.service.js";
import { serializeLive } from "./live.serializer.js";
import { liveQuerySchema, updateLinksSchema, startLiveSchema } from "./live.schema.js";

const liveService = new LiveService();
const router = Router();

// El store_id efectivo SIEMPRE es req.tiendaId (validado contra la membresía por
// requireTiendaAccess a partir de ?tiendaId=), nunca un valor arbitrario del body.
// editor puede gestionar el live; los GET permiten viewer.

// GET / - Configuración actual (crea la fila por defecto si no existe)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: liveQuerySchema }),
  async (req, res, next) => {
    try {
      const row = await liveService.get(req.tiendaId, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_GET", data: serializeLive(row) });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /links - Guarda o actualiza los enlaces sin activar el live
router.put(
  "/links",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ query: liveQuerySchema, body: updateLinksSchema }),
  async (req, res, next) => {
    try {
      const row = await liveService.updateLinks(req.tiendaId, req.body, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_LINKS_SAVED", data: serializeLive(row) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /start - Inicia el live
router.post(
  "/start",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ query: liveQuerySchema, body: startLiveSchema }),
  async (req, res, next) => {
    try {
      const row = await liveService.start(req.tiendaId, req.body, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_STARTED", data: serializeLive(row) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /extend - Suma 1 hora (tope 12h desde el inicio)
router.post(
  "/extend",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ query: liveQuerySchema }),
  async (req, res, next) => {
    try {
      const row = await liveService.extend(req.tiendaId, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_EXTENDED", data: serializeLive(row) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /stop - Apaga el live
router.post(
  "/stop",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ query: liveQuerySchema }),
  async (req, res, next) => {
    try {
      const row = await liveService.stop(req.tiendaId, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIVE_STOPPED", data: serializeLive(row) });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
