import { Router } from "express";
import config from "../../config/index.js";
import { crearLimitador } from "../../kernel/http/rate-limit.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda, scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PasarelaService from "./pasarela/pasarela.service.js";
import { crearCargoSchema } from "./pasarela/pasarela.schema.js";
import { configPublica, exigirAutomatico } from "./modo-pago.service.js";
import { tiendaQuerySchema } from "../reservas/reservas.schema.js";

const pasarelaService = new PasarelaService();

const router = Router();

// Rate limit del pago, alineado al del checkout: procesar cargos es sensible y
// un bot no debería martillar el endpoint. Reusa el tope de checkout.
const pagoLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.checkoutMax,
  code: "TOO_MANY_PAYMENTS",
  message: "Demasiados intentos de pago en poco tiempo, intenta más tarde"
});

// ============================================
// GET /config - Cómo cobra la tienda (pago-automatico R2.3). Sin caché: el
// dueño puede cambiar el modo y la tienda debe verlo en el siguiente pago.
// ============================================
router.get("/config", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const data = await configPublica(req.query.tiendaId);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PAGOS_CONFIG", data });
  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /cargo - Crear un cargo para un pedido (público, storefront)
// El frontend genera el token con Culqi.js y lo envía aquí. Si la tienda se
// resolvió por subdominio, el tiendaId del body se fuerza a esa tienda.
// ============================================
router.post(
  "/cargo",
  pagoLimiter,
  scopeBodyToTienda,
  validate({ body: crearCargoSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, pedidoId, tokenId, metodo, email, antifraud } = req.body;
      const { proveedor } = await exigirAutomatico(tiendaId);
      const pago = await pasarelaService.crearCargo({
        tiendaId, pedidoId, tokenId, metodo, proveedor, email, antifraud
      });

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PAGO_CREATED", data: pago });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
