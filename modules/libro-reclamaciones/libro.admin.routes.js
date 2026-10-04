import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import {
  detalleHoja,
  exportarHojasCsv,
  listarHojasAdmin,
  marcarEnAtencion,
  responderHoja,
  resumenHojas,
  vistaPreviaRespuesta
} from "./libro.service.js";
import {
  cambiarEstadoSchema,
  exportarQuerySchema,
  idParamSchema,
  listarAdminQuerySchema,
  responderSchema,
  tiendaQuerySchema,
  vistaPreviaSchema
} from "./libro.schema.js";

const router = Router();

// Ver la bandeja: cualquier miembro (viewer+). Responder y exportar: admin+,
// porque la respuesta es una comunicación legal de la tienda (spec R6.9).

// ============================================
// GET /resumen?tiendaId=X — Conteos para el badge del menú
// ============================================
router.get(
  "/resumen",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: tiendaQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await resumenHojas(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_RESUMEN", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /exportar.csv?tiendaId=X&desde=&hasta= — Descarga para Indecopi o el contador
// (antes de /:id para que "exportar.csv" no se lea como id)
// ============================================
router.get(
  "/exportar.csv",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ query: exportarQuerySchema }),
  async (req, res, next) => {
    try {
      const { desde, hasta } = req.validatedQuery;
      const csv = await exportarHojasCsv(req.tiendaId, { desde, hasta });
      const nombre = `libro-reclamaciones${desde ? `-${desde}` : ""}${hasta ? `-a-${hasta}` : ""}.csv`;
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="${nombre}"`);
      res.set("Cache-Control", "private, no-store");
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /?tiendaId=X&estado=&tipo=&semaforo=&desde=&hasta=&q= — Bandeja
// ============================================
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: listarAdminQuerySchema }),
  async (req, res, next) => {
    try {
      const { data, meta } = await listarHojasAdmin(req.tiendaId, req.validatedQuery);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_LIST", data, meta });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /:id?tiendaId=X — Hoja completa + eventos + pedido enlazado
// ============================================
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await detalleHoja(req.tiendaId, req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_HOJA", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /:id/estado — Marcar "en atención" (uso interno)
// ============================================
router.patch(
  "/:id/estado",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: cambiarEstadoSchema }),
  async (req, res, next) => {
    try {
      const data = await marcarEnAtencion(req.tiendaId, req.params.id, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_ESTADO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /:id/respuesta/vista-previa — HTML del correo que recibirá el consumidor
// ============================================
router.post(
  "/:id/respuesta/vista-previa",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: vistaPreviaSchema }),
  async (req, res, next) => {
    try {
      const data = await vistaPreviaRespuesta(req.tiendaId, req.params.id, req.body);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_VISTA_PREVIA", data });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /:id/respuesta — Responder (correo al consumidor, o registro de carta entregada)
// ============================================
router.post(
  "/:id/respuesta",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: responderSchema }),
  async (req, res, next) => {
    try {
      const data = await responderHoja(req.tiendaId, req.params.id, req.body, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "LIBRO_HOJA_RESPONDIDA", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
