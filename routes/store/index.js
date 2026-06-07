import { Router } from "express";
import { resolveTienda } from "../../middlewares/resolve-tienda.middleware.js";
import tiendasRoutes from "./tiendas.routes.js";
import categoriasRoutes from "./categorias.routes.js";
import productosRoutes from "./productos.routes.js";
import metodosPagoRoutes from "./metodos-pago.routes.js";
import zonasEnvioRoutes from "./zonas-envio.routes.js";
import pedidosRoutes from "./pedidos.routes.js";
import cuponesRoutes from "./cupones.routes.js";

const router = Router();

// Resuelve la tienda a partir del subdominio (zapateriaalonso.ecompyme.com)
// o, si no aplica (dev local, dominio propio aún no soportado), del slug
// explícito en query/params. Deja req.tienda / req.tiendaId disponibles
// "best effort" — no bloquea si no logra resolver (ver middleware para detalle).
router.use(resolveTienda);

// Rutas públicas del storefront — no requieren autenticación
// Filtrar siempre por ?tiendaId= para scope multi-tenant
router.use("/tiendas", tiendasRoutes);
router.use("/categorias", categoriasRoutes);
router.use("/productos", productosRoutes);
router.use("/metodos-pago", metodosPagoRoutes);
router.use("/zonas-envio", zonasEnvioRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/cupones", cuponesRoutes);

export default router;
