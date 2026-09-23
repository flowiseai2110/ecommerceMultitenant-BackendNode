import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PasarelaConfigService from "./pasarela/pasarela-config.service.js";
import { upsertConfigSchema, configQuerySchema } from "./pasarela/pasarela.schema.js";

const configService = new PasarelaConfigService();

const router = Router();

// ============================================
// GET / - Lista las configs de pasarela de la tienda (admin, sin secretos)
// ?tiendaId=... requerido por requireTiendaAccess.
// ============================================
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ query: configQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await configService.list(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PASARELA_CONFIG_LIST", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT / - Crea o actualiza la config de un proveedor para la tienda (admin)
// Cifra la llave secreta / webhook secret antes de guardar. Solo owner/admin.
// ============================================
router.put(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: upsertConfigSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      const config = await configService.upsert(req.tiendaId, data, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "PASARELA_CONFIG_SAVED", data: config });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
