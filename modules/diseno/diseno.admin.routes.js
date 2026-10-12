import { Router } from "express";
import { z } from "zod";
import { requireAnyMembership } from "../../kernel/tenant/index.js";
import { requirePlatformAdmin } from "../../middlewares/platform-admin.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { getCatalogo } from "./diseno.service.js";
import { actualizarPlantilla, crearPlantilla, listarPlantillas } from "./plantillas.service.js";
import { estructuraSchema, temaSchema } from "./secciones.schema.js";

const router = Router();

// GET /admin/diseno/catalogo — Plantillas, paletas, tipografías y presets de
// sección (docs/specs/estructura-tienda, R1.2). Es de la plataforma, igual
// para todas las tiendas: basta con pertenecer a alguna.
router.get("/catalogo", requireAnyMembership(), (req, res) => {
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "DISENO_CATALOGO", data: getCatalogo() });
});

// ── Plantillas de la plataforma (docs/specs/editor-diseno-en-vivo, fase 2) ──
// Solo el administrador de la plataforma (PLATFORM_ADMIN_EMAILS). La
// autenticación la pone el router de /admin.

const nombreSchema = z.string().trim().min(3, "Mínimo 3 caracteres").max(80, "Máximo 80 caracteres");
const descripcionSchema = z.string().trim().max(300, "Máximo 300 caracteres");

const crearPlantillaSchema = z.object({
  tiendaId: z.string().uuid(),
  nombre: nombreSchema,
  descripcion: descripcionSchema.default(""),
  estructura: estructuraSchema,
  tema: temaSchema.nullable().default(null)
});

const actualizarPlantillaSchema = z
  .object({
    nombre: nombreSchema.optional(),
    descripcion: descripcionSchema.optional(),
    orden: z.number().int().min(0).max(100000).optional(),
    activa: z.boolean().optional(),
    // Reemplazar el diseño con el de una tienda (P6).
    tiendaId: z.string().uuid().optional(),
    estructura: estructuraSchema.optional(),
    tema: temaSchema.nullable().optional()
  })
  .refine((d) => !d.estructura || d.tiendaId, { message: "Falta la tienda del diseño", path: ["tiendaId"] })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "No hay cambios" });

const plantillaIdParams = z.object({ id: z.string().min(1).max(60) });
const listarQuery = z.object({ tipoNegocio: z.string().min(1).max(30) });

// GET /admin/diseno/plantillas?tipoNegocio= — Todas las del tipo, también las ocultas (P8).
router.get("/plantillas", requirePlatformAdmin, validate({ query: listarQuery }), (req, res) => {
  const data = listarPlantillas(req.query.tipoNegocio);
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "DISENO_PLANTILLAS", data });
});

// POST /admin/diseno/plantillas — Plantilla nueva con el diseño de una tienda (P4, P5).
router.post("/plantillas", requirePlatformAdmin, validate({ body: crearPlantillaSchema }), async (req, res, next) => {
  try {
    const data = await crearPlantilla(req.body, req.user);
    return apiResponse(res, { status: 201, type: "SUCCESS", code: "DISENO_PLANTILLA_CREADA", data });
  } catch (error) {
    next(error);
  }
});

// PUT /admin/diseno/plantillas/:id — Datos, orden, visibilidad o diseño (P6, P7).
router.put("/plantillas/:id", requirePlatformAdmin, validate({ params: plantillaIdParams, body: actualizarPlantillaSchema }), async (req, res, next) => {
  try {
    const data = await actualizarPlantilla(req.params.id, req.body, req.user);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "DISENO_PLANTILLA_ACTUALIZADA", data });
  } catch (error) {
    next(error);
  }
});

export default router;
