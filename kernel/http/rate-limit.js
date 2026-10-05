import rateLimit from "express-rate-limit";
import { clientIp } from "./client-ip.js";

/**
 * Fábrica única de rate limiters. Por defecto la clave es la IP real del
 * visitante (clientIp), no req.ip: detrás de Vercel req.ip puede ser la IP
 * del proxy y el límite se repartiría entre todos los visitantes.
 *
 * @param {object} opciones
 * @param {number} opciones.windowMs
 * @param {number} opciones.max
 * @param {string} opciones.code - Código de error de la respuesta 429.
 * @param {string} opciones.message - Mensaje para el usuario.
 * @param {(req: import("express").Request) => string} [opciones.keyGenerator] - Por defecto, clientIp.
 * @param {object} [opciones.resto] - Cualquier otra opción de express-rate-limit (skip, skipSuccessfulRequests...).
 */
export function crearLimitador({ windowMs, max, code, message, keyGenerator = clientIp, ...resto }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    message: { status: 429, type: "ERROR", code, data: { message } },
    standardHeaders: true,
    legacyHeaders: false,
    ...resto
  });
}
