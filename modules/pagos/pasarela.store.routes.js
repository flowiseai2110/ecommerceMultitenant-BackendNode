import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeBodyToTienda } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PasarelaService from "./pasarela/pasarela.service.js";
import { crearCargoSchema } from "./pasarela/pasarela.schema.js";

const pasarelaService = new PasarelaService();

const router = Router();

// Rate limit del pago, alineado al del checkout: procesar cargos es sensible y
// un bot no debería martillar el endpoint. Reusa el tope de checkout.
const pagoLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.checkoutMax,
  message: {
    status: 429,
    type: "ERROR",
    code: "TOO_MANY_PAYMENTS",
    data: { message: "Demasiados intentos de pago en poco tiempo, intenta más tarde" }
  },
  standardHeaders: true,
  legacyHeaders: false
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
      const { tiendaId, pedidoId, tokenId, metodo, proveedor, email, antifraud } = req.body;
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
