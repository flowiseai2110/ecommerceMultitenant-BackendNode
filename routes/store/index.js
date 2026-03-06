import { Router } from "express";
import tiendasRoutes from "./tiendas.routes.js";
import categoriasRoutes from "./categorias.routes.js";
import productosRoutes from "./productos.routes.js";
import metodosPagoRoutes from "./metodos-pago.routes.js";
import zonasEnvioRoutes from "./zonas-envio.routes.js";
import pedidosRoutes from "./pedidos.routes.js";

const router = Router();

// Rutas públicas del storefront — no requieren autenticación
// Filtrar siempre por ?tiendaId= para scope multi-tenant
router.use("/tiendas", tiendasRoutes);
router.use("/categorias", categoriasRoutes);
router.use("/productos", productosRoutes);
router.use("/metodos-pago", metodosPagoRoutes);
router.use("/zonas-envio", zonasEnvioRoutes);
router.use("/pedidos", pedidosRoutes);

export default router;
