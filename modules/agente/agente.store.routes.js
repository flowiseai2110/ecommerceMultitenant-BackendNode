import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { requireTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { mensajeAgenteSchema, conversacionQuerySchema } from "./agente.schema.js";
import { responder, responderStream, recuperarConversacion } from "./agente.controller.js";

const router = Router();

// Cada consulta cuesta una llamada a un LLM (dinero), así que hay dos límites
// por minuto (docs/specs/agente-ventas/spec.md, R3):
// - por IP: el sessionToken lo elige el cliente, y rotándolo se saltaría un
//   límite solo por sesión. Va antes de validar: la basura también cuenta.
// - por tienda + sesión: frena el spam dentro de una conversación.
// /mensajes y /mensajes/stream comparten los contadores.
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

// optionalAuth: con sesión, estado_pedido puede ver los pedidos del cliente (req.user).
// Sin token (o inválido) sigue como visitante.
const cadenaMensaje = [
  requireTienda, limiteIp, optionalAuth, validate({ body: mensajeAgenteSchema }), limiteSesion
];

// POST /mensajes - Enviar un mensaje al asesor de ventas IA (público, storefront).
// requireTienda garantiza que toda búsqueda quede scoped a una tienda concreta.
router.post("/mensajes", ...cadenaMensaje, responder);

// POST /mensajes/stream - Lo mismo, con la respuesta por Server-Sent Events.
router.post("/mensajes/stream", ...cadenaMensaje, responderStream);

// GET /conversacion?sessionToken=… - Mensajes de la conversación activa, para
// reabrir el chat. No llama al LLM; comparte el límite por IP.
router.get(
  "/conversacion",
  requireTienda,
  limiteIp,
  validate({ query: conversacionQuerySchema }),
  recuperarConversacion
);

export default router;
