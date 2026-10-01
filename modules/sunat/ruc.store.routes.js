import { Router } from "express";
import { apiResponse } from "../../utils/apiResponse.js";
import { consultarRuc } from "./ruc.service.js";

const router = Router();

// GET /ruc/:ruc — razón social, estado, condición y dirección fiscal según el
// padrón de SUNAT (público). Lo usa el checkout para autocompletar la factura.
router.get("/ruc/:ruc", async (req, res, next) => {
  try {
    const data = await consultarRuc(String(req.params.ruc).trim());
    // El padrón cambia una vez al día; un error (SUNAT caído) no se cachea.
    res.set("Cache-Control", "public, max-age=3600");
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "RUC_FOUND", data });
  } catch (error) {
    next(error);
  }
});

export default router;
