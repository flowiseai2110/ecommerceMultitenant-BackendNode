import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../../kernel/tenant/index.js";
import { crearLimitador } from "../../kernel/http/rate-limit.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { campanaParamsSchema, guardarCampanaSchema, revisionSchema } from "./promocion.schema.js";
import { guardarCampana, obtenerPromocion, revision } from "./promocion.service.js";

/**
 * Paso 3 de una campaña (docs/specs/campanas-descuento T3b.5, decisión E2).
 * Montado en /admin/tiendas; todo con rol admin, como el PUT de diseño:
 *   PUT  /:id/campanas/:campanaId                      → campaña + promoción + confirmación, en una transacción
 *   GET  /:id/campanas/:campanaId/promocion            → promoción, estado y última confirmación
 *   POST /:id/campanas/:campanaId/promocion/revision   → conteo, ejemplo y avisos del diálogo (solo lectura)
 */

const router = Router();

// La tienda es el :id de la ruta (como en tiendas.admin.routes.js).
const tiendaDeLaRuta = resolveTiendaId(async (req) => req.params.id);

// La revisión completa recorre el alcance y el historial de precios: límite por usuario.
const revisionLimiter = crearLimitador({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  code: "TOO_MANY_REQUESTS",
  message: "Hiciste muchas revisiones seguidas. Espera un minuto."
});

const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

router.put(
  "/:id/campanas/:campanaId",
  validate({ params: campanaParamsSchema, body: guardarCampanaSchema }),
  tiendaDeLaRuta,
  requireTiendaAccess("admin"),
  async (req, res) => ok(res, "CAMPANA_GUARDADA", await guardarCampana(req.params.id, req.params.campanaId, req.body, req.user))
);

router.get(
  "/:id/campanas/:campanaId/promocion",
  validate({ params: campanaParamsSchema }),
  tiendaDeLaRuta,
  requireTiendaAccess("admin"),
  async (req, res) => ok(res, "CAMPANA_PROMOCION", await obtenerPromocion(req.params.id, req.params.campanaId))
);

router.post(
  "/:id/campanas/:campanaId/promocion/revision",
  revisionLimiter,
  validate({ params: campanaParamsSchema, body: revisionSchema }),
  tiendaDeLaRuta,
  requireTiendaAccess("admin"),
  async (req, res) => {
    const { completa, ...borrador } = req.body;
    return ok(res, "CAMPANA_PROMOCION_REVISION", await revision(req.params.id, req.params.campanaId, borrador, { completa }));
  }
);

export default router;
