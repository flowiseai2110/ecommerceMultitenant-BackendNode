import { Router } from "express";
import { requireAnyMembership } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { getCatalogo } from "./diseno.service.js";

const router = Router();

// GET /admin/diseno/catalogo — Plantillas, paletas, tipografías y presets de
// sección (docs/specs/estructura-tienda, R1.2). Es de la plataforma, igual
// para todas las tiendas: basta con pertenecer a alguna.
router.get("/catalogo", requireAnyMembership(), (req, res) => {
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "DISENO_CATALOGO", data: getCatalogo() });
});

export default router;
