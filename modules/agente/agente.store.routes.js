import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { mensajeAgenteSchema } from "./agente.schema.js";
import { responder } from "./agente.controller.js";

const router = Router();

// Cada consulta cuesta una llamada a un LLM (dinero), así que hay dos límites
// por minuto (docs/specs/agente-ventas/spec.md, R3):
// - por IP: el sessionToken lo elige el cliente, y rotándolo se saltaría un
//   límite solo por sesión. Va antes de validar: la basura también cuenta.
// - por tienda + sesión: frena el spam dentro de una conversación.
const MINUTO_MS = 60 * 1000;

const mensajeLimite = {
  status: 429,
  type: "ERROR",
  code: "TOO_MANY_AI_REQUESTS",
  data: { message: "Demasiadas consultas al asesor, espera un momento." }
};

const limiteIp = rateLimit({
  windowMs: MINUTO_MS,
  max: config.agente.rateLimitIpMin,
  message: mensajeLimite,
  standardHeaders: true,
  legacyHeaders: false
});

const limiteSesion = rateLimit({
  windowMs: MINUTO_MS,
  max: config.agente.rateLimitSesionMin,
  // Después de validate: el token ya tiene un charset cerrado.
  keyGenerator: (req) => `${req.tiendaId}:${req.body.sessionToken}`,
  message: mensajeLimite,
  standardHeaders: true,
  legacyHeaders: false
});

// POST /mensajes - Enviar un mensaje al asesor de ventas IA (público, storefront).
// requireTienda garantiza que toda búsqueda quede scoped a una tienda concreta.
router.post(
  "/mensajes",
  requireTienda,
  limiteIp,
  validate({ body: mensajeAgenteSchema }),
  limiteSesion,
  responder
);

export default router;
