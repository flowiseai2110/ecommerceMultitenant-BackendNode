import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { UnauthorizedError } from "../../utils/errors.js";
import { estadoApp, pruebaDesdeApp, terminarDesdeApp, vincularApp } from "./transmisiones.service.js";
import { vincularSchema } from "./transmisiones.schema.js";

/**
 * App Transmitir (docs/specs/transmision-eventos/spec.md, R11): la app canjea
 * el código del QR y luego usa su token de sesión (Authorization: Bearer).
 * Sin cuenta de usuario: el QR lo genera un editor+ desde el admin.
 */

const router = Router();
const ok = (res, code, data) => {
  res.set("Cache-Control", "no-store");
  return apiResponse(res, { status: 200, type: "SUCCESS", code, data });
};

function bearer(req) {
  const [tipo, token] = (req.get("authorization") ?? "").split(" ");
  if (tipo !== "Bearer" || !token) throw new UnauthorizedError("Falta el token de la app");
  return token;
}

router.post("/vincular", validate({ body: vincularSchema }), async (req, res, next) => {
  try { return ok(res, "APP_VINCULADA", await vincularApp(req.body.codigo)); } catch (error) { next(error); }
});

router.get("/estado", async (req, res, next) => {
  try { return ok(res, "APP_ESTADO", await estadoApp(bearer(req))); } catch (error) { next(error); }
});

router.post("/prueba", async (req, res, next) => {
  try { return ok(res, "APP_PRUEBA", await pruebaDesdeApp(bearer(req))); } catch (error) { next(error); }
});

router.post("/terminar", async (req, res, next) => {
  try { return ok(res, "APP_TERMINADA", await terminarDesdeApp(bearer(req))); } catch (error) { next(error); }
});

export default router;
