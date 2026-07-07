import { Router } from "express";
import { resolveTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { cache } from "../../utils/cache.js";
import tiendasRoutes from "./tiendas.routes.js";
import categoriasRoutes from "./categorias.routes.js";
import productosRoutes from "./productos.routes.js";
import metodosPagoRoutes from "./metodos-pago.routes.js";
import metodosEnvioRoutes from "./metodos-envio.routes.js";
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
router.use("/tiendas", cache(300), tiendasRoutes);
router.use("/categorias", cache(300), categoriasRoutes);
router.use("/productos", cache(60), productosRoutes);
router.use("/metodos-pago", cache(300), metodosPagoRoutes);
router.use("/metodos-envio", cache(300), metodosEnvioRoutes);
router.use("/pedidos", pedidosRoutes);       // sin caché — rastreo en tiempo real
router.use("/cupones", cuponesRoutes);

export default router;
