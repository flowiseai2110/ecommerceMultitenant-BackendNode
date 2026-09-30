import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { mensajeAgenteSchema } from "./agente.schema.js";
import { responder } from "./agente.controller.js";

const router = Router();

// Rate limit propio del asesor: cada consulta cuesta una llamada a un LLM (dinero).
// Se limita por sessionToken (no por IP) para acotar el gasto por conversación y
// frenar bots. Un cliente legítimo no manda decenas de mensajes por ventana.
const agenteLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.agente.rateLimitMax,
  keyGenerator: (req) => req.body?.sessionToken || req.ip,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_AI_REQUESTS",
    data: { message: "Demasiadas consultas al asesor, espera un momento." }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// POST /mensajes - Enviar un mensaje al asesor de ventas IA (público, storefront).
// requireTienda garantiza que toda búsqueda quede scoped a una tienda concreta.
router.post(
  "/mensajes",
  requireTienda,
  validate({ body: mensajeAgenteSchema }),
  agenteLimiter,
  responder
);

export default router;
