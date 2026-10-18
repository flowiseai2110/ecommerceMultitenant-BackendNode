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
  async (req, res) => {
    const { page, limit, activo } = req.query;
    const { data, meta } = await listCupones(req.tiendaId, { page, limit, activo });
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPONES_LIST", data, meta });
  }
);

// GET /:id — Obtener cupón por ID
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const data = await getCupon(req.tiendaId, req.params.id);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_FOUND", data });
  }
);

// POST / — Crear cupón
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ body: createCuponSchema }),
  async (req, res) => {
    const data = await createCupon(req.body);
    return apiResponse(res, { status: 201, type: "SUCCESS", code: "CUPON_CREATED", data });
  }
);

// PUT /:id — Actualizar cupón
router.put(
  "/:id",
  authMiddleware,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateCuponSchema }),
  async (req, res) => {
    const data = await updateCupon(req.tiendaId, req.params.id, req.body);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_UPDATED", data });
  }
);

// DELETE /:id — Eliminar cupón
router.delete(
  "/:id",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    await deleteCupon(req.tiendaId, req.params.id);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_DELETED", data: null });
  }
);

export default router;
