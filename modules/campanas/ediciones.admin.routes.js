import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { requirePlatformAdmin } from "../../middlewares/platform-admin.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { fechaCivilLima } from "./calendario.js";
import { anioQuerySchema, edicionBodySchema, edicionParamsSchema, presetParamsSchema, tiendasQuerySchema } from "./ediciones.schema.js";
import { eliminar, guardar, tiendasConCampana, vistaAnio } from "./ediciones.service.js";

/**
 * Fechas por año de las campañas (docs/specs/campanas-cuando R2): solo el
 * administrador de la plataforma (PLATFORM_ADMIN_EMAILS); cualquier otro, 403.
 *   GET    /admin/campanas/ediciones?anio=                    → ediciones esperadas del año, con lo cargado y su historial
 *   GET    /admin/campanas/ediciones/:presetId/tiendas[?anio=&clave=] → { total, conPromocion } (R7.7; promociones confirmadas, campanas-descuento T3b.10)
 *   PUT    /admin/campanas/ediciones/:presetId/:anio/:clave   → carga o cambia una edición
 *   DELETE /admin/campanas/ediciones/:presetId/:anio/:clave   → la quita
 */

const router = Router();
router.use(requirePlatformAdmin);

const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

router.get("/", validate({ query: anioQuerySchema }), async (req, res) => {
  const anio = req.validatedQuery.anio ?? fechaCivilLima(new Date()).anio;
  return ok(res, "CAMPANA_EDICIONES_LIST", { anio, campanas: await vistaAnio(anio) });
});

router.get("/:presetId/tiendas", validate({ params: presetParamsSchema, query: tiendasQuerySchema }), async (req, res) => {
  return ok(res, "CAMPANA_EDICIONES_TIENDAS", await tiendasConCampana(req.params.presetId, req.validatedQuery));
});

router.put("/:presetId/:anio/:clave", validate({ params: edicionParamsSchema, body: edicionBodySchema }), async (req, res) => {
  return ok(res, "CAMPANA_EDICION_SAVED", await guardar(req.params, req.body, req.user));
});

router.delete("/:presetId/:anio/:clave", validate({ params: edicionParamsSchema }), async (req, res) => {
  await eliminar(req.params, req.user);
  return ok(res, "CAMPANA_EDICION_DELETED", null);
});

export default router;
