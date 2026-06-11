import { logger } from "../config/logger.js";

// Umbrales en milisegundos
const MS_WARN = 500;   // lento: > 500ms
const MS_ERR  = 2000;  // muy lento: > 2s

// Acumulador en memoria por ruta (se reinicia al reiniciar el servidor)
const _stats = new Map();

function _record(key, method, route, status, ms) {
  if (!_stats.has(key)) {
    _stats.set(key, {
      method,
      route,
      count: 0,
      totalMs: 0,
      minMs: Infinity,
      maxMs: 0,
      slowCount: 0,  // > MS_WARN
      errorCount: 0, // status >= 500
      lastSeen: null,
    });
  }
  const s = _stats.get(key);
  s.count++;
  s.totalMs += ms;
  if (ms < s.minMs) s.minMs = ms;
  if (ms > s.maxMs) s.maxMs = ms;
  if (ms >= MS_WARN) s.slowCount++;
  if (status >= 500) s.errorCount++;
  s.lastSeen = new Date().toISOString();
}

/** Devuelve las métricas acumuladas ordenadas por tiempo promedio desc. */
export function getRouteMetrics() {
  return Array.from(_stats.values())
    .map((s) => ({
      ...s,
      avgMs: s.count > 0 ? Math.round(s.totalMs / s.count) : 0,
      minMs: s.minMs === Infinity ? 0 : s.minMs,
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
}

/** Resetea todos los contadores. */
export function resetRouteMetrics() {
  _stats.clear();
}

/**
 * Middleware de monitoreo de performance.
 * - Mide duración exacta de cada request.
 * - Acumula estadísticas por ruta en memoria.
 * - Emite warn para requests lentos (> 500ms) y error para muy lentos (> 2s).
 * - Emite info para requests normales (visible en producción con LOG_LEVEL=info).
 */
export function performanceMiddleware(req, res, next) {
  const startMs = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - startMs;

    // req.route se asigna después del matching; puede no existir en 404s
    const route = req.route
      ? `${req.baseUrl || ""}${req.route.path}`
      : req.path;

    const key = `${req.method} ${route}`;
    const { statusCode } = res;

    _record(key, req.method, route, statusCode, ms);

    const meta = {
      method:   req.method,
      url:      req.originalUrl,
      route,
      status:   statusCode,
      ms,
      userId:   req.user?.id    ?? "-",
      tiendaId: req.tiendaId    ?? "-",
    };

    if (ms >= MS_ERR) {
      logger.error(`[PERF] MUY LENTO ${ms}ms — ${req.method} ${route}`, meta);
    } else if (ms >= MS_WARN) {
      logger.warn(`[PERF] LENTO ${ms}ms — ${req.method} ${route}`, meta);
    } else {
      // info es visible en producción con LOG_LEVEL=info (default)
      logger.info(`[PERF] ${req.method} ${route} ${statusCode} ${ms}ms`, meta);
    }
  });

  next();
}
