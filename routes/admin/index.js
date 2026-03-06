import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import tiendasRoutes from "../tiendas.routes.js";
import categoriasRoutes from "../categorias.routes.js";
import productosRoutes from "../productos.routes.js";
import productoVariantesRoutes from "../producto-variantes.routes.js";
import productoImagenesRoutes from "../producto-imagenes.routes.js";
import productoAtributosRoutes from "../producto-atributos.routes.js";
import usersRoutes from "../users.routes.js";
import invitationsRoutes from "../invitations.routes.js";
import metodosPagoRoutes from "../metodos-pago.routes.js";
import pedidosRoutes from "../pedidos.routes.js";
import zonasEnvioRoutes from "../zonas-envio.routes.js";

const router = Router();

// Auth requerida en todas las rutas de administración
router.use(authMiddleware);

router.use("/tiendas", tiendasRoutes);
router.use("/categorias", categoriasRoutes);
router.use("/productos", productosRoutes);
router.use("/producto-variantes", productoVariantesRoutes);
router.use("/producto-imagenes", productoImagenesRoutes);
router.use("/producto-atributos", productoAtributosRoutes);
router.use("/users", usersRoutes);
router.use("/invitations", invitationsRoutes);
router.use("/metodos-pago", metodosPagoRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/zonas-envio", zonasEnvioRoutes);

export default router;
