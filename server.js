import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import swaggerUi from "swagger-ui-express";

import config from "./config/index.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { runWithTenantContext } from "./kernel/tenant/index.js";
import { crearLimitador } from "./kernel/http/rate-limit.js";
import { resolveClientIp } from "./kernel/http/client-ip.js";
import { requireMetricsToken } from "./middlewares/metrics-auth.middleware.js";
import routes from "./routes/index.js";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { performanceMiddleware, getRouteMetrics, resetRouteMetrics } from "./middlewares/performance.middleware.js";
import { iniciarJobTransmisiones } from "./jobs/transmisiones.job.js";

// Soporte para serializar BigInt a JSON
BigInt.prototype.toJSON = function() {
  return this.toString();
};

const app = express();

// Railway (y cualquier PaaS) pone la app detrás de su proxy: sin esto,
// req.ip es la IP del proxy y el rate limiting cuenta a TODOS los visitantes
// como una sola IP. Se confía en un número exacto de saltos (TRUST_PROXY_HOPS,
// por defecto 2 = edge + proxy interno de Railway); nunca "true", porque permitiría a un
// cliente falsificar su IP vía X-Forwarded-For y evadir el rate limit.
// El SSR del storefront no pasa por aquí: ver kernel/http/client-ip.js.
app.set("trust proxy", config.trustProxyHops);

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Helmet - Headers de seguridad
app.use(helmet());

// Compresión gzip — reduce el tamaño de las respuestas JSON un 70-80%
app.use(compression());

// CORS - Configuración
// El navegador del storefront llama a la API directo (no por el rewrite de
// Vercel, que ocultaba la IP real) desde el dominio de cada tienda, incluidos
// dominios propios que no se conocen de antemano. /store es público y no usa
// cookies (el JWT del comprador va en Authorization): se abre a cualquier
// origen. El resto de la API (admin) mantiene la lista CORS_ORIGIN.
const corsBase = {
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // Cachea el preflight (Chrome topa en 2 h): menos OPTIONS por visita.
  maxAge: 7200
};
const esRutaStore = (req) => req.path === "/api/v1/store" || req.path.startsWith("/api/v1/store/");
app.use(cors((req, callback) => callback(null, esRutaStore(req)
  ? { ...corsBase, origin: "*", credentials: false }
  : { ...corsBase, origin: config.cors.origin, credentials: config.cors.credentials })));

// Rate Limiting global por IP real del visitante. Lecturas y escrituras con
// contadores separados: navegar el catálogo no debe consumir el cupo de
// escrituras, y las escrituras sensibles (checkout, reseñas...) tienen además
// su propio límite por ruta.
const esLectura = (req) => req.method === "GET" || req.method === "HEAD";
const mensajeLimiteGlobal = { code: "TOO_MANY_REQUESTS", message: "Demasiadas solicitudes, intente más tarde" };
app.use(crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.readMax,
  skip: (req) => !esLectura(req),
  ...mensajeLimiteGlobal
}));
app.use(crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: esLectura,
  ...mensajeLimiteGlobal
}));

// ============================================
// MIDDLEWARES DE PARSING
// ============================================

// Parse JSON bodies. Los webhooks guardan además el cuerpo crudo: su firma se
// calcula sobre los bytes exactos (ej. Cloudflare Stream).
app.use(express.json({
  limit: "10mb",
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith("/api/v1/webhooks/")) req.rawBody = Buffer.from(buf);
  }
}));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================
// CONTEXTO DE TENANT (AsyncLocalStorage)
// ============================================

// Abre un contexto de tenant por request. Los resolvers de tenant escriben el
// tiendaId cuando lo resuelven, y la extensión de Prisma lo lee para auto-inyectar
// el scope de tienda (defensa en profundidad). Ver kernel/tenant/tenant-store.js.
app.use((req, res, next) => runWithTenantContext(next));

// ============================================
// MONITOREO DE PERFORMANCE (todos los entornos)
// ============================================

app.use(performanceMiddleware);

// ============================================
// MÉTRICAS DE PERFORMANCE
// ============================================

// Protegidas con METRICS_TOKEN (header X-Metrics-Key). Sin token configurado
// responden 404, igual que una ruta inexistente.
app.use("/api/v1/metrics", requireMetricsToken);

// GET /api/v1/metrics — estadísticas acumuladas por ruta (desde el último reinicio)
app.get("/api/v1/metrics", (req, res) => {
  const routes = getRouteMetrics();
  res.json({
    status: 200,
    type: "SUCCESS",
    code: "METRICS",
    data: {
      uptime:        Math.round(process.uptime()),
      memory:        process.memoryUsage(),
      totalRequests: routes.reduce((acc, r) => acc + r.count, 0),
      routes,
    },
  });
});

// POST /api/v1/metrics/reset — limpia los contadores en memoria
app.post("/api/v1/metrics/reset", (req, res) => {
  resetRouteMetrics();
  res.json({ status: 200, type: "SUCCESS", code: "METRICS_RESET", data: null });
});

// GET /api/v1/debug/ip — diagnóstico temporal (DEBUG_CLIENT_IP=true): qué IP
// ve el backend y qué headers trajo la request. Abrirlo desde el dominio de
// una tienda (pasa por el rewrite de Vercel) y compararlo con la IP real.
// Devuelve al visitante solo sus propios datos.
if (config.debugClientIp) {
  app.get("/api/v1/debug/ip", (req, res) => {
    const { ip, source } = resolveClientIp(req);
    res.json({
      status: 200,
      type: "SUCCESS",
      code: "DEBUG_IP",
      data: {
        clientIp: ip,
        source,
        trustProxyHops: config.trustProxyHops,
        reqIp: req.ip,
        reqIps: req.ips,
        socket: req.socket.remoteAddress,
        headers: {
          "x-forwarded-for": req.get("x-forwarded-for") ?? null,
          "x-real-ip": req.get("x-real-ip") ?? null,
          "x-vercel-forwarded-for": req.get("x-vercel-forwarded-for") ?? null,
          "x-vercel-id": req.get("x-vercel-id") ?? null
        }
      }
    });
  });
}

// ============================================
// DOCUMENTACIÓN SWAGGER
// ============================================

app.use("/api/v1/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: "PC.NODE.ADMIN API Docs",
  customCss: ".swagger-ui .topbar { display: none }"
}));

// Endpoint para obtener el JSON de OpenAPI
app.get("/api/v1/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ============================================
// RUTAS DE LA API
// ============================================

// Prefijo /api/v1 para versionado
app.use("/api/v1", routes);

// Ruta raíz
app.get("/", (req, res) => {
  res.json({
    name: "PC.NODE.ADMIN API",
    version: "2.0.0",
    status: "running",
    documentation: "/api-docs",
    api: "/api/v1"
  });
});

// ============================================
// MANEJO DE ERRORES
// ============================================

// 404 - Ruta no encontrada
app.use(notFoundHandler);

// Error handler global
app.use(errorHandler);

// ============================================
// INICIO DEL SERVIDOR
// ============================================

const PORT = config.port;

async function startServer() {
  try {
    // Verificar conexión a la base de datos
    await prisma.$connect();
    logger.info("Conexión a base de datos establecida");

    app.listen(PORT, () => {
      logger.info(`Servidor corriendo en http://localhost:${PORT}`);
      logger.info(`Ambiente: ${config.nodeEnv}`);
      logger.info(`API disponible en http://localhost:${PORT}/api/v1`);
    });

    // Corte, señal y limpieza de las transmisiones en vivo (plan Privado).
    iniciarJobTransmisiones();
  } catch (error) {
    logger.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on("SIGTERM", async () => {
  logger.info("SIGTERM recibido, cerrando servidor...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT recibido, cerrando servidor...");
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar servidor
startServer();

export default app;
