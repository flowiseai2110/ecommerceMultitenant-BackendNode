import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { cambiarModo, guardarCredenciales, obtenerModo } from "./modo-pago.service.js";
import { configQuerySchema, credencialesPagoSchema, modoPagoSchema } from "./pasarela/pasarela.schema.js";

/**
 * Cómo cobra la tienda (docs/specs/pago-automatico R1.2): manual o automático.
 * El proveedor no se elige ni se muestra; `faltan` dice qué completar para
 * activar el automático (llavePublica, llaveSecreta, activo, proveedor).
 */
const router = Router();

// GET /?tiendaId= → { modo, listo, faltan[] }
router.get("/", authMiddleware, requireTiendaAccess("admin"), validate({ query: configQuerySchema }), async (req, res) => {
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "MODO_PAGO", data: await obtenerModo(req.tiendaId) });
});

// PUT / { tiendaId, modo } → { modo, listo, faltan[] }; 422 PASARELA_NO_LISTA si falta configurar
router.put("/", authMiddleware, requireTiendaAccess("admin"), validate({ body: modoPagoSchema }), async (req, res) => {
  const data = await cambiarModo(req.tiendaId, req.body.modo, req.user);
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "MODO_PAGO_GUARDADO", data });
});

// PUT /credenciales { tiendaId, llavePublica, llaveSecreta? } → igual que GET /
router.put("/credenciales", authMiddleware, requireTiendaAccess("admin"), validate({ body: credencialesPagoSchema }), async (req, res) => {
  const { llavePublica, llaveSecreta } = req.body;
  const data = await guardarCredenciales(req.tiendaId, { llavePublica, llaveSecreta }, req.user);
  return apiResponse(res, { status: 200, type: "SUCCESS", code: "PAGO_CREDENCIALES_GUARDADAS", data });
});

export default router;
