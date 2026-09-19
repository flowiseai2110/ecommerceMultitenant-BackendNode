import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import {
  createCuponSchema,
  updateCuponSchema,
  idParamSchema,
  paginationSchema
} from "./cupones.schema.js";
import {
  listCupones,
  getCupon,
  createCupon,
  updateCupon,
  deleteCupon
} from "./cupones.service.js";

const router = Router();

// GET / — Listar cupones de una tienda
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const { page, limit, activo } = req.query;
      const { data, meta } = await listCupones(req.tiendaId, { page, limit, activo });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPONES_LIST", data, meta });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id — Obtener cupón por ID
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const data = await getCupon(req.tiendaId, req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_FOUND", data });
    } catch (error) {
      next(error);
    }
  }
);

// POST / — Crear cupón
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ body: createCuponSchema }),
  async (req, res, next) => {
    try {
      const data = await createCupon(req.body);
      return apiResponse(res, { status: 201, type: "SUCCESS", code: "CUPON_CREATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /:id — Actualizar cupón
router.put(
  "/:id",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateCuponSchema }),
  async (req, res, next) => {
    try {
      const data = await updateCupon(req.tiendaId, req.params.id, req.body);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /:id — Eliminar cupón
router.delete(
  "/:id",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      await deleteCupon(req.tiendaId, req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_DELETED", data: null });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
