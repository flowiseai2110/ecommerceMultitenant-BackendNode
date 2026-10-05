import config from "../config/index.js";
import { secretoIgual } from "../kernel/http/secretos.js";
import { notFoundHandler } from "./error.middleware.js";

/**
 * Protege /api/v1/metrics: exige el header X-Metrics-Key igual a METRICS_TOKEN.
 * Sin token configurado o con token incorrecto responde el mismo 404 que una
 * ruta inexistente, para no revelar que el endpoint existe.
 */
export function requireMetricsToken(req, res, next) {
  if (secretoIgual(req.get("x-metrics-key"), config.metrics.token)) return next();
  return notFoundHandler(req, res);
}
