import { Router } from "express";
import personaRoutes from "./persona.routes.js";
import uploadsRoutes from "./uploads.routes.js";
import adminRoutes from "./admin/index.js";
import storeRoutes from "./store/index.js";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Verifica el estado del servidor
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Servidor funcionando correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00.000Z"
 *                 uptime:
 *                   type: number
 *                   description: Tiempo en segundos que el servidor ha estado activo
 *                   example: 3600.5
 */
router.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// RUTAS GENERALES (sin prefijo de contexto)
// ============================================
router.use("/personas", personaRoutes);
router.use("/uploads", uploadsRoutes);

// ============================================
// RUTAS DE ADMINISTRACIÓN — /api/v1/admin/...
// Requieren JWT + membresía en usuario_tiendas
// Usadas por el Angular Admin
// ============================================
router.use("/admin", adminRoutes);

// ============================================
// RUTAS DEL STOREFRONT — /api/v1/store/...
// Endpoints públicos del catálogo y checkout
// Usadas por el Angular Store
// ============================================
router.use("/store", storeRoutes);

export default router;
