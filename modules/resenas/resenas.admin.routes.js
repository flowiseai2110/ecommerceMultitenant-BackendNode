import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import {
  cambiarEstadoResena,
  getModoModeracion,
  listarResenasAdmin,
  responderResena,
  setModoModeracion
} from "./resenas.service.js";
import {
  cambiarEstadoSchema,
  configModeracionSchema,
  idParamSchema,
  listarAdminQuerySchema,
  responderSchema,
  tiendaQuerySchema
} from "./resenas.schema.js";

const router = Router();

// ============================================
// GET /?tiendaId=X&estado=pendiente — Bandeja de moderación
// meta.porEstado trae los conteos para el badge y las pestañas.
// ============================================
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: listarAdminQuerySchema }),
  async (req, res, next) => {
    try {
      const { estado, page, limit } = req.validatedQuery || req.query;
      const { data, meta } = await listarResenasAdmin(req.tiendaId, { estado, page, limit });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENAS_LIST", data, meta });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /config?tiendaId=X — Modo de moderación de la tienda
// ============================================
router.get(
  "/config",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: tiendaQuerySchema }),
  async (req, res, next) => {
    try {
      const moderacion = await getModoModeracion(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENAS_CONFIG", data: { moderacion } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /config — Cambiar moderación (previa | automatica). Decisión del dueño: admin.
// ============================================
router.put(
  "/config",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: configModeracionSchema }),
  async (req, res, next) => {
    try {
      const data = await setModoModeracion(req.tiendaId, req.body.moderacion, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENAS_CONFIG_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /:id/estado — Aprobar o rechazar
// ============================================
router.patch(
  "/:id/estado",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: cambiarEstadoSchema }),
  async (req, res, next) => {
    try {
      const data = await cambiarEstadoResena(req.tiendaId, req.params.id, req.body.estado, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENA_ESTADO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id/respuesta — Responder públicamente (null borra la respuesta)
// ============================================
router.put(
  "/:id/respuesta",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: responderSchema }),
  async (req, res, next) => {
    try {
      const data = await responderResena(req.tiendaId, req.params.id, req.body.respuesta, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "RESENA_RESPONDIDA", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
