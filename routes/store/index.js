import { Router } from "express";
import { resolveTienda } from "../../middlewares/resolve-tienda.middleware.js";
import { cache } from "../../utils/cache.js";
import { cacheRespuesta } from "../../utils/store-cache.js";
import tiendasRoutes from "../../modules/tenants/tiendas.store.routes.js";
import categoriasRoutes from "../../modules/catalogo/categorias.store.routes.js";
import productosRoutes from "../../modules/catalogo/productos.store.routes.js";
import metodosPagoRoutes from "../../modules/pagos/metodos-pago.store.routes.js";
import pasarelaRoutes from "../../modules/pagos/pasarela.store.routes.js";
import metodosEnvioRoutes from "../../modules/envios/metodos-envio.store.routes.js";
import cotizacionEnvioRoutes from "../../modules/envios/cotizacion.store.routes.js";
import pedidosRoutes from "../../modules/ordenes/pedidos.store.routes.js";
import cuentaRoutes from "../../modules/ordenes/cuenta.store.routes.js";
import resenasRoutes from "../../modules/resenas/resenas.store.routes.js";
import cuponesRoutes from "../../modules/cupones/cupones.store.routes.js";
import liveRoutes from "../../modules/live/live.store.routes.js";
import agenteRoutes from "../../modules/agente/agente.store.routes.js";
import sunatRoutes from "../../modules/sunat/ruc.store.routes.js";
import libroRoutes from "../../modules/libro-reclamaciones/libro.store.routes.js";
import reservasRoutes from "../../modules/reservas/reservas.store.routes.js";
import transmisionesRoutes from "../../modules/transmisiones/transmisiones.store.routes.js";

const router = Router();

/** Un live activo no se sirve desde memoria después de su expiraEn. */
function ttlHastaExpirar(body) {
  const expiraEn = body?.data?.expiraEn;
  return expiraEn ? new Date(expiraEn).getTime() - Date.now() : Infinity;
}

// Resuelve la tienda a partir del subdominio (zapateriaalonso.ecompyme.com)
// o, si no aplica (dev local, dominio propio aún no soportado), del slug
// explícito en query/params. Deja req.tienda / req.tiendaId disponibles
// "best effort" — no bloquea si no logra resolver (ver middleware para detalle).
router.use(resolveTienda);

// Rutas públicas del storefront — no requieren autenticación
// Filtrar siempre por ?tiendaId= para scope multi-tenant
router.use("/tiendas", cache(300), tiendasRoutes);
router.use("/categorias", cache(300), cacheRespuesta("categorias"), categoriasRoutes);
router.use("/productos", cache(60), productosRoutes);
router.use("/metodos-pago", cache(300), cacheRespuesta("metodos-pago"), metodosPagoRoutes);
router.use("/pagos", pasarelaRoutes);        // sin caché — crea cargos en la pasarela
router.use("/metodos-envio", cache(300), cacheRespuesta("envios"), metodosEnvioRoutes);
// Cotizar: sin caché HTTP, pero sí en memoria por URL (ubigeo+subtotal). El pedido
// vuelve a cotizar dentro de su transacción, así que una cotización vieja no se cobra.
router.use("/envios", cacheRespuesta("envios"), cotizacionEnvioRoutes);
router.use("/pedidos", pedidosRoutes);       // sin caché — rastreo en tiempo real
router.use("/cuenta", cuentaRoutes);         // sin caché — datos privados del comprador (JWT)
router.use("/resenas", resenasRoutes);       // caché solo en GET /producto y /destacadas (lo fija la ruta)
router.use("/cupones", cuponesRoutes);
// Caché corta: el tiempo real llega por Realtime. En memoria nunca pasa de expiraEn.
router.use("/live", cache(15), cacheRespuesta("live", { ttlDe: ttlHastaExpirar }), liveRoutes);
router.use("/agente", agenteRoutes);          // sin caché — cada consulta es conversacional y única
router.use("/sunat", sunatRoutes);            // caché solo en respuestas exitosas (lo fija la ruta)
router.use("/libro-reclamaciones", libroRoutes); // sin caché global — la cabecera del proveedor la fija la ruta
router.use("/reservas", reservasRoutes);          // sin caché global — cada ruta fija la suya (mini booking)
router.use("/transmisiones", transmisionesRoutes);  // sin caché — página del invitado (enlace firmado)

export default router;
