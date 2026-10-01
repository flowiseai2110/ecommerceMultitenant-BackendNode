import { Router } from "express";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { cotizarQuerySchema } from "./zonas-envio.schema.js";
import { cotizarEnvios } from "./cotizacion.service.js";
import { ValidationError } from "../../utils/errors.js";

const router = Router();

// GET /cotizar?tiendaId=&ubigeo=&subtotal= — cotiza todos los métodos activos
// para el destino (público). El total final lo vuelve a calcular el backend
// al crear el pedido: esto es solo para mostrarlo en el checkout.
router.get("/cotizar", validate({ query: cotizarQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId, ubigeo, subtotal } = req.validatedQuery || req.query;
    if (!tiendaId) throw new ValidationError("Tienda no especificada");
    const data = await cotizarEnvios(tiendaId, { ubigeo: ubigeo ?? null, subtotal: Number(subtotal) || 0 });
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "ENVIO_COTIZACION", data });
  } catch (error) {
    next(error);
  }
});

export default router;
