import { Router } from "express";
import personaRoutes from "./persona.routes.js";
import tiendasRoutes from "./tiendas.routes.js";
import categoriasRoutes from "./categorias.routes.js";
import productosRoutes from "./productos.routes.js";
import productoVariantesRoutes from "./producto-variantes.routes.js";
import productoImagenesRoutes from "./producto-imagenes.routes.js";
import productoAtributosRoutes from "./producto-atributos.routes.js";
import usersRoutes from "./users.routes.js";
import invitationsRoutes from "./invitations.routes.js";
import uploadsRoutes from "./uploads.routes.js";
import pedidosRoutes from "./pedidos.routes.js";
import metodosPagoRoutes from "./metodos-pago.routes.js";
import zonasEnvioRoutes from "./zonas-envio.routes.js";

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

// Registrar rutas de módulos
router.use("/personas", personaRoutes);
router.use("/tiendas", tiendasRoutes);
router.use("/categorias", categoriasRoutes);
router.use("/productos", productosRoutes);
router.use("/producto-variantes", productoVariantesRoutes);
router.use("/producto-imagenes", productoImagenesRoutes);
router.use("/producto-atributos", productoAtributosRoutes);
router.use("/users", usersRoutes);
router.use("/invitations", invitationsRoutes);
router.use("/uploads", uploadsRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/metodos-pago", metodosPagoRoutes);
router.use("/zonas-envio", zonasEnvioRoutes);

export default router;
