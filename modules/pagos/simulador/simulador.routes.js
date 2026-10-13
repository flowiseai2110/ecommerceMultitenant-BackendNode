import { Router } from "express";
import config from "../../../config/index.js";
import { logger } from "../../../config/logger.js";
import { SimuladorPasarela, SimuladorError } from "./simulador.js";

/**
 * API del simulador de pasarela (docs/specs/pago-automatico R6). Responde como
 * una pasarela externa (JSON plano, rechazos con 402), no con apiResponse: el
 * storefront la usa para tokenizar y el proveedor "simulado" para cobrar.
 *
 * Solo se monta con PAGOS_SIMULADOR=true y fuera de producción (routes/index.js).
 */

async function notificar(evento) {
  try {
    await fetch(config.pagos.simulador.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento)
    });
  } catch (error) {
    logger.warn(`Simulador de pagos: no se pudo avisar el webhook (${error.message})`);
  }
}

export const simulador = new SimuladorPasarela({
  notificar,
  demoraPendienteMs: config.pagos.simulador.demoraPendienteMs
});

const router = Router();

const responder = (fn, status = 200) => (req, res) => {
  try {
    return res.status(status).json(fn(req));
  } catch (error) {
    if (error instanceof SimuladorError) {
      return res.status(error.status).json({ codigo: error.codigo, mensaje: error.message });
    }
    logger.error(`Simulador de pagos: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ codigo: "error_interno", mensaje: "Error del simulador" });
  }
};

// POST /tokens: { tarjeta: { numero, vencimiento, cvv }, email } | { yape: { celular, otp } }
router.post("/tokens", responder((req) => simulador.tokenizar(req.body ?? {}), 201));

// POST /cargos: { token, monto, moneda, email, descripcion, metadata }
router.post("/cargos", responder((req) => simulador.cobrar(req.body ?? {}), 201));

router.get("/cargos/:id", responder((req) => simulador.obtener(req.params.id)));

router.post("/cargos/:id/devolucion", responder((req) => simulador.devolver(req.params.id)));

export default router;
