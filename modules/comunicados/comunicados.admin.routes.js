import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { invalidateTiendasStoreCache } from "../tenants/tiendas.cache.js";
import { getComunicadosAdmin, saveComunicados } from "./comunicados.service.js";
import { contarDestinatarios, iniciarEnvio } from "./comunicados.email.js";
import {
  comunicadoIdParamSchema,
  comunicadosQuerySchema,
  rangoEmailQuerySchema,
  rangoEmailSchema,
  updateComunicadosSchema
} from "./comunicados.schema.js";

const router = Router();

// El id de tienda efectivo es SIEMPRE req.tiendaId (validado contra la
// membresía por requireTiendaAccess a partir de ?tiendaId=), nunca el body.

// GET / — Lista completa con el estado de cada comunicado (R1.1)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: comunicadosQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await getComunicadosAdmin(req.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "COMUNICADOS_GET", data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT / — Reemplaza la lista entera (R1.2). Los comunicados viajan embebidos
// en GET /store/tiendas: se invalida esa caché para que se vean al instante.
router.put(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ query: comunicadosQuerySchema, body: updateComunicadosSchema }),
  async (req, res, next) => {
    try {
      const data = await saveComunicados(req.tiendaId, req.body.comunicados, req.user);
      invalidateTiendasStoreCache();
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "COMUNICADOS_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/destinatarios?desde&hasta — A cuántos clientes con reserva en
// esas fechas les llegaría el email (R7.2). Solo cuenta: no expone correos.
router.get(
  "/:id/destinatarios",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: comunicadoIdParamSchema, query: rangoEmailQuerySchema }),
  async (req, res, next) => {
    try {
      const { desde, hasta } = req.validatedQuery;
      const data = await contarDestinatarios(req.tiendaId, req.params.id, { desde, hasta });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "COMUNICADO_DESTINATARIOS", data });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/enviar-email — Envía el comunicado una sola vez a los clientes
// con reserva en el rango (R7.3). Rol admin: escribe a clientes reales y no
// se puede deshacer. Responde 202 y los correos salen en segundo plano.
router.post(
  "/:id/enviar-email",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: comunicadoIdParamSchema, query: comunicadosQuerySchema, body: rangoEmailSchema }),
  async (req, res, next) => {
    try {
      const data = await iniciarEnvio(req.tiendaId, req.params.id, req.body, req.user);
      return apiResponse(res, { status: 202, type: "SUCCESS", code: "COMUNICADO_EMAIL_ENVIANDO", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
