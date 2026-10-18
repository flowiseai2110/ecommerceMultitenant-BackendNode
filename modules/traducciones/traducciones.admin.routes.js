import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { guardarManual, listarTextos, traducirPendientes } from "./traducciones.service.js";
import { NOMBRES_FUENTES } from "./fuentes.js";
import { codigoIdiomaSchema } from "../idiomas/idioma.js";

/**
 * Traducciones del contenido de la tienda, un idioma a la vez (docs/specs/idiomas D3).
 * `idioma` es opcional: sin él, el primero que eligió la tienda.
 * Ver, viewer+; corregir y traducir con IA, admin+.
 */

const router = Router();
const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

const tiendaQuery = z.object({ tiendaId: z.string().uuid("tiendaId inválido"), idioma: codigoIdiomaSchema.optional() });
const manualSchema = z.object({
  tiendaId: z.string().uuid("tiendaId inválido"),
  idioma: codigoIdiomaSchema.optional(),
  fuente: z.enum(NOMBRES_FUENTES),
  id: z.string().min(1).max(100),
  campo: z.string().min(1).max(300), // un texto fijo usa el propio texto como clave
  texto: z.union([z.string().max(5000), z.array(z.string().max(100)).max(30)])
});

router.get("/", requireTiendaAccess("viewer"), validate({ query: tiendaQuery }), async (req, res) => {
  return ok(res, "TRADUCCIONES", await listarTextos(req.tiendaId, req.validatedQuery.idioma));
});

router.put("/", requireTiendaAccess("admin"), validate({ body: manualSchema }), async (req, res) => {
  const idioma = await guardarManual(req.tiendaId, req.body, req.user);
  return ok(res, "TRADUCCION_GUARDADA", await listarTextos(req.tiendaId, idioma.codigo));
});

// "Traducir con IA" lo que falta: síncrono, para que el dueño vea el resultado al terminar.
router.post("/generar", requireTiendaAccess("admin"), validate({ body: tiendaQuery }), async (req, res) => {
  const traducidos = await traducirPendientes(req.tiendaId, req.body.idioma);
  return ok(res, "TRADUCCIONES_GENERADAS", { traducidos, ...(await listarTextos(req.tiendaId, req.body.idioma)) });
});

export default router;
