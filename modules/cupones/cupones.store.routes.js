import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { codigoParamSchema, validarCuponQuerySchema } from "./cupones.schema.js";
import { validarCupon } from "./cupones.service.js";

const router = Router();

// GET /validar/:codigo?tiendaId=X&subtotal=Y&whatsappNumero=Z — Validar cupón (público)
router.get(
  "/validar/:codigo",
  validate({ params: codigoParamSchema, query: validarCuponQuerySchema }),
  async (req, res) => {
    const { codigo } = req.params;
    const { tiendaId, subtotal, whatsappNumero } = req.query;

    const data = await validarCupon(tiendaId, codigo, subtotal, whatsappNumero);

    return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_VALIDADO", data });
  }
);

export default router;
