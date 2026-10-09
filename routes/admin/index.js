import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { invalidarAlEscribir } from "../../utils/store-cache.js";
import tiendasRoutes from "../../modules/tenants/tiendas.admin.routes.js";
import categoriasRoutes from "../../modules/catalogo/categorias.admin.routes.js";
import productosRoutes from "../../modules/catalogo/productos.admin.routes.js";
import productoVariantesRoutes from "../../modules/catalogo/producto-variantes.admin.routes.js";
import productoImagenesRoutes from "../../modules/catalogo/producto-imagenes.admin.routes.js";
import productoAtributosRoutes from "../../modules/catalogo/producto-atributos.admin.routes.js";
import usersRoutes from "../../modules/tenants/users.admin.routes.js";
import invitationsRoutes from "../../modules/tenants/invitations.admin.routes.js";
import metodosPagoRoutes from "../../modules/pagos/metodos-pago.admin.routes.js";
import pasarelaConfigRoutes from "../../modules/pagos/pasarela-config.admin.routes.js";
import pedidosRoutes from "../../modules/ordenes/pedidos.admin.routes.js";
import metodosEnvioRoutes from "../../modules/envios/metodos-envio.admin.routes.js";
import cuponesRoutes from "../../modules/cupones/cupones.admin.routes.js";
import liveRoutes from "../../modules/live/live.admin.routes.js";
import resenasRoutes from "../../modules/resenas/resenas.admin.routes.js";
import studioRoutes from "../studio.routes.js";
import asistenteRoutes from "../../modules/asistente/asistente.admin.routes.js";
import consumoIaRoutes from "../../modules/consumo-ia/consumo-ia.admin.routes.js";
import disenoRoutes from "../../modules/diseno/diseno.admin.routes.js";
import libroRoutes from "../../modules/libro-reclamaciones/libro.admin.routes.js";
import reservasRoutes from "../../modules/reservas/reservas.admin.routes.js";
import transmisionesRoutes from "../../modules/transmisiones/transmisiones.admin.routes.js";
import comunicadosRoutes from "../../modules/comunicados/comunicados.admin.routes.js";
import traduccionesRoutes from "../../modules/traducciones/traducciones.admin.routes.js";
import { traducirTrasGuardar } from "../../modules/traducciones/traducciones.service.js";

const router = Router();

// Auth requerida en todas las rutas de administración
router.use(authMiddleware);

// Las escrituras exitosas limpian la caché en memoria del storefront
// (utils/store-cache.js). Tiendas → "envios": cotizar usa envioGratisMinimo.
// traducirTrasGuardar: tras guardar contenido, programa su traducción al inglés
// si la tienda lo tiene activo (docs/specs/hospedaje-completo C3).
router.use("/tiendas", invalidarAlEscribir("envios"), traducirTrasGuardar, tiendasRoutes);
router.use("/categorias", invalidarAlEscribir("categorias"), traducirTrasGuardar, categoriasRoutes);
router.use("/productos", traducirTrasGuardar, productosRoutes);
router.use("/producto-variantes", productoVariantesRoutes);
router.use("/producto-imagenes", productoImagenesRoutes);
router.use("/producto-atributos", productoAtributosRoutes);
router.use("/users", usersRoutes);
router.use("/invitations", invitationsRoutes);
router.use("/metodos-pago", invalidarAlEscribir("metodos-pago"), metodosPagoRoutes);
router.use("/pasarela-config", pasarelaConfigRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/metodos-envio", invalidarAlEscribir("envios"), metodosEnvioRoutes);
router.use("/cupones", cuponesRoutes);
router.use("/live", invalidarAlEscribir("live"), liveRoutes);
router.use("/resenas", invalidarAlEscribir("resenas"), resenasRoutes);
router.use("/studio", studioRoutes);
router.use("/asistente", asistenteRoutes);
router.use("/consumo-ia", consumoIaRoutes);
router.use("/diseno", disenoRoutes);
router.use("/libro-reclamaciones", libroRoutes);
router.use("/reservas", traducirTrasGuardar, reservasRoutes);
router.use("/traducciones", traduccionesRoutes);
router.use("/transmisiones", transmisionesRoutes);
router.use("/comunicados", comunicadosRoutes);

export default router;
