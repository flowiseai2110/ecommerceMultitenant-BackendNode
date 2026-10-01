import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { ajustesConsumoIaSchema, consumoIaParamsSchema, consumoIaQuerySchema } from "./consumo-ia.schema.js";
import { guardarAjustes, obtenerConsumo } from "./consumo-ia.service.js";

const router = Router();

// GET / - Consumo del mes (asesor + guía). Cualquier miembro puede verlo.
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: consumoIaQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await obtenerConsumo(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CONSUMO_IA_GET", data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /:tipo - Ajustar límite / aviso. Toca el gasto de la tienda: admin u owner.
router.put(
  "/:tipo",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ query: consumoIaQuerySchema, params: consumoIaParamsSchema, body: ajustesConsumoIaSchema }),
  async (req, res, next) => {
    try {
      const data = await guardarAjustes(req.tiendaId, req.params.tipo, req.body, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CONSUMO_IA_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
