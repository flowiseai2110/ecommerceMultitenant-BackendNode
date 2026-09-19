import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import tiendasRoutes from "../tiendas.routes.js";
import categoriasRoutes from "../../modules/catalogo/categorias.admin.routes.js";
import productosRoutes from "../../modules/catalogo/productos.admin.routes.js";
import productoVariantesRoutes from "../../modules/catalogo/producto-variantes.admin.routes.js";
import productoImagenesRoutes from "../../modules/catalogo/producto-imagenes.admin.routes.js";
import productoAtributosRoutes from "../../modules/catalogo/producto-atributos.admin.routes.js";
import usersRoutes from "../users.routes.js";
import invitationsRoutes from "../invitations.routes.js";
import metodosPagoRoutes from "../metodos-pago.routes.js";
import pedidosRoutes from "../pedidos.routes.js";
import metodosEnvioRoutes from "../metodos-envio.routes.js";
import cuponesRoutes from "../cupones.routes.js";
import studioRoutes from "../studio.routes.js";

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
router.use("/metodos-envio", metodosEnvioRoutes);
router.use("/cupones", cuponesRoutes);
router.use("/studio", studioRoutes);

export default router;
