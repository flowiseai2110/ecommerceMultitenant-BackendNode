import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { esAdminPlataforma, requirePlatformAdmin } from "../../middlewares/platform-admin.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { actualizarIdiomaSchema, codigoParamSchema, crearIdiomaSchema } from "./idiomas.schema.js";
import { actualizarIdioma, crearIdiomaPlataforma, idiomasActivos, listarTodos } from "./idiomas.service.js";
import { estadoIdiomas } from "./publicacion.service.js";
import { permisoVistaPrevia } from "./idiomas-tienda.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { codigoIdiomaSchema } from "./idioma.js";
import { requireTiendaAccess } from "../../kernel/tenant/index.js";
import { z } from "zod";

const tiendaQuery = z.object({ tiendaId: z.string().uuid("tiendaId inválido") });
const vistaPreviaQuery = tiendaQuery.extend({ idioma: codigoIdiomaSchema });

/**
 * Idiomas (docs/specs/idiomas D1, D9). Cualquier usuario del admin ve los
 * activos (para elegir los de su tienda); solo el administrador de la
 * plataforma ve todos y los crea o edita. No se borran: se desactivan.
 */

const router = Router();
const ok = (res, code, data, status = 200) => apiResponse(res, { status, type: "SUCCESS", code, data });

router.get("/", async (_req, res, next) => {
  try { return ok(res, "IDIOMAS_LIST", await idiomasActivos()); } catch (error) { next(error); }
});

// GET /tienda?tiendaId= — idiomas de la tienda con su avance y si están publicados (P5).
router.get("/tienda", requireTiendaAccess("viewer"), validate({ query: tiendaQuery }), async (req, res, next) => {
  try { return ok(res, "IDIOMAS_TIENDA", await estadoIdiomas(req.tiendaId)); } catch (error) { next(error); }
});

// GET /vista-previa?tiendaId=&idioma= — permiso de 1 hora para ver la tienda en un
// idioma elegido aunque no esté publicado (modo traducir; diseno.md B3). Quien traduce: admin.
router.get("/vista-previa", requireTiendaAccess("admin"), validate({ query: vistaPreviaQuery }), async (req, res, next) => {
  try {
    const { token, expiraEn, slug } = await permisoVistaPrevia(req.tiendaId, req.validatedQuery?.idioma ?? req.query.idioma);
    return ok(res, "IDIOMA_VISTA_PREVIA", { token, expiraEn, url: slug ? urlTienda(slug, "") : null });
  } catch (error) { next(error); }
});

// GET /permisos — si quien entra administra la plataforma (el admin muestra el enlace a la pantalla Idiomas).
router.get("/permisos", (req, res) => ok(res, "IDIOMAS_PERMISOS", { plataforma: esAdminPlataforma(req.user) }));

router.get("/plataforma", requirePlatformAdmin, async (_req, res, next) => {
  try { return ok(res, "IDIOMAS_PLATAFORMA_LIST", await listarTodos()); } catch (error) { next(error); }
});

router.post("/", requirePlatformAdmin, validate({ body: crearIdiomaSchema }), async (req, res, next) => {
  try { return ok(res, "IDIOMA_CREATED", await crearIdiomaPlataforma(req.body, req.user), 201); } catch (error) { next(error); }
});

router.put("/:codigo", requirePlatformAdmin, validate({ params: codigoParamSchema, body: actualizarIdiomaSchema }), async (req, res, next) => {
  try { return ok(res, "IDIOMA_UPDATED", await actualizarIdioma(req.params.codigo, req.body, req.user)); } catch (error) { next(error); }
});

export default router;
