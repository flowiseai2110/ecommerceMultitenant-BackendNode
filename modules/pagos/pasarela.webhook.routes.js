import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { logger } from "../../config/logger.js";
import PasarelaService from "./pasarela/pasarela.service.js";
import { webhookProveedorParamSchema } from "./pasarela/pasarela.schema.js";

const pasarelaService = new PasarelaService();

const router = Router();

// ============================================
// POST /:proveedor - Recepción de webhooks del PSP (server-to-server, público)
//
// Fuente de verdad del estado de pago. NO confía en el payload: reconfirma el
// cargo contra la API del proveedor antes de tocar el pedido, y es idempotente
// (un evento reenviado no se reprocesa — ver pasarela.service).
//
// Responde 200 rápido siempre que el evento se haya recibido/registrado; si
// respondiéramos error, el proveedor reintentaría. Los fallos de negocio se
// loggean, no se propagan como 5xx al proveedor.
//
// NOTA (pendiente): verificación de firma HMAC. Hoy la confianza recae en la
// reconfirmación contra la API del proveedor. Cuando se confirme el esquema de
// firma de Culqi, validarla aquí con el webhook secret de la tienda (ver
// pasarela-de-pagos/01-culqi-integracion-tecnica.md §7).
// ============================================
router.post(
  "/:proveedor",
  validate({ params: webhookProveedorParamSchema }),
  async (req, res) => {
    const { proveedor } = req.params;
    try {
      const resultado = await pasarelaService.procesarWebhook({ proveedor, body: req.body });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "WEBHOOK_RECEIVED", data: resultado });
    } catch (error) {
      // No propagar 5xx al proveedor por un fallo de negocio: registrar y 200.
      logger.error(`Error procesando webhook ${proveedor}: ${error.message}`, { stack: error.stack });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "WEBHOOK_RECEIVED", data: { procesado: false, error: true } });
    }
  }
);

export default router;
