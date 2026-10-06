import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { clientIp } from "./client-ip.js";
import { secretoIgual } from "./secretos.js";

/**
 * Pruebas de carga (k6 sale desde UNA sola IP): con X-Carga-Key igual a
 * CARGA_KEY la request no cuenta para ningún rate limit. Sin CARGA_KEY
 * configurada el bypass no existe. Activarla solo durante una campaña de
 * pruebas y borrarla al terminar.
 */
export const esPruebaDeCarga = (req) => secretoIgual(req.get("x-carga-key"), config.carga.key);

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
 * @param {(req: import("express").Request, res: import("express").Response) => boolean} [opciones.skip]
 * @param {object} [opciones.resto] - Cualquier otra opción de express-rate-limit (skipSuccessfulRequests...).
 */
export function crearLimitador({ windowMs, max, code, message, keyGenerator = clientIp, skip, ...resto }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    message: { status: 429, type: "ERROR", code, data: { message } },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => esPruebaDeCarga(req) || Boolean(skip?.(req, res)),
    ...resto
  });
}
