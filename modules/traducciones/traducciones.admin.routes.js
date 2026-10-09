import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { guardarManual, listarTextos, traducirPendientes } from "./traducciones.service.js";

/**
 * Traducciones al inglés del contenido de la tienda (docs/specs/hospedaje-completo C3).
 * Ver, viewer+; corregir y traducir, admin+.
 */

const router = Router();
const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

const tiendaQuery = z.object({ tiendaId: z.string().uuid("tiendaId inválido") });
const manualSchema = z.object({
  tiendaId: z.string().uuid("tiendaId inválido"),
  fuente: z.enum(["productos", "tours", "categorias", "habitaciones", "extras", "temporadas", "planes", "config", "diseno"]),
  id: z.string().min(1).max(100),
  campo: z.string().min(1).max(120),
  texto: z.union([z.string().max(5000), z.array(z.string().max(100)).max(30)])
});

router.get("/", requireTiendaAccess("viewer"), validate({ query: tiendaQuery }), async (req, res, next) => {
  try { return ok(res, "TRADUCCIONES", await listarTextos(req.tiendaId)); } catch (error) { next(error); }
});

router.put("/", requireTiendaAccess("admin"), validate({ body: manualSchema }), async (req, res, next) => {
  try {
    await guardarManual(req.tiendaId, req.body, req.user);
    return ok(res, "TRADUCCION_GUARDADA", await listarTextos(req.tiendaId));
  } catch (error) { next(error); }
});

// "Traducir todo": síncrono, para que el dueño vea el resultado al terminar.
router.post("/generar", requireTiendaAccess("admin"), validate({ body: tiendaQuery }), async (req, res, next) => {
  try {
    const traducidos = await traducirPendientes(req.tiendaId);
    return ok(res, "TRADUCCIONES_GENERADAS", { traducidos, ...(await listarTextos(req.tiendaId)) });
  } catch (error) { next(error); }
});

export default router;
