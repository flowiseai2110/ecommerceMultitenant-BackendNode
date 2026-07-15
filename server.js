import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";

import config from "./config/index.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import routes from "./routes/index.js";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { performanceMiddleware, getRouteMetrics, resetRouteMetrics } from "./middlewares/performance.middleware.js";

// Soporte para serializar BigInt a JSON
BigInt.prototype.toJSON = function() {
  return this.toString();
};

const app = express();

// Railway (y cualquier PaaS) pone la app detrás de su proxy: sin esto,
// req.ip es la IP del proxy y el rate limiting cuenta a TODOS los visitantes
// como una sola IP. "1" = confiar solo en el primer salto (el edge de Railway);
// no usar "true" porque permitiría a un cliente falsificar su IP vía
// X-Forwarded-For y evadir el rate limit.
app.set("trust proxy", 1);

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Helmet - Headers de seguridad
app.use(helmet());

// Compresión gzip — reduce el tamaño de las respuestas JSON un 70-80%
app.use(compression());

// CORS - Configuración
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Rate Limiting - Protección contra ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_REQUESTS",
    data: { message: "Demasiadas solicitudes, intente más tarde" }
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// ============================================
// MIDDLEWARES DE PARSING
// ============================================

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================
// MONITOREO DE PERFORMANCE (todos los entornos)
// ============================================

app.use(performanceMiddleware);

// ============================================
// MÉTRICAS DE PERFORMANCE
// ============================================

// GET /api/v1/metrics — estadísticas acumuladas por ruta (desde el último reinicio)
// IMPORTANTE: proteger con IP allowlist o auth antes de exponer en internet
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
