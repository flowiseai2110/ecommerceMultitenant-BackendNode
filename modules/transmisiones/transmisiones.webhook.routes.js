import { Router } from "express";
import { apiResponse } from "../../utils/apiResponse.js";
import { logger } from "../../config/logger.js";
import { procesarWebhook } from "./transmisiones.envivo.js";

/**
 * Webhooks del proveedor de video (R6.2, R10.2). Server-to-server y públicos:
 * la firma se verifica sobre el cuerpo crudo (req.rawBody, ver server.js).
 *   POST /webhooks/stream/videos          → Cloudflare Stream (Webhook-Signature)
 *   POST /webhooks/stream/notificaciones  → Cloudflare Notifications (cf-webhook-auth)
 * Una firma inválida responde 401. Un fallo de negocio se registra y responde
 * 200, para que el proveedor no reintente sin fin. El job de cada minuto
 * reconcilia la señal aunque un aviso se pierda.
 */

const router = Router();

for (const tipo of ["videos", "notificaciones"]) {
  router.post(`/${tipo}`, async (req, res) => {
    try {
      const r = await procesarWebhook({ tipo, headers: req.headers, rawBody: req.rawBody });
      if (!r.valido) {
        logger.warn(`Webhook de stream (${tipo}) con firma inválida`);
        return apiResponse(res, { status: 401, type: "ERROR", code: "WEBHOOK_INVALIDO", data: { message: "Firma inválida" } });
      }
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "WEBHOOK_RECEIVED", data: { duplicado: r.duplicado } });
    } catch (error) {
      logger.error(`Error procesando webhook de stream (${tipo}): ${error.message}`, { stack: error.stack });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "WEBHOOK_RECEIVED", data: { procesado: false } });
    }
  });
}

export default router;
