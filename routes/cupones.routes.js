import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess } from "../middlewares/tienda-access.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError } from "../utils/errors.js";
import {
  createCuponSchema,
  updateCuponSchema,
  idParamSchema,
  paginationSchema
} from "../validators/cupones.validator.js";

const router = Router();

// GET / — Listar cupones de una tienda
// GET /admin/cupones?tiendaId=X
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20, tiendaId, activo } = req.query;
      const take = Math.min(parseInt(limit) || 20, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;

      const where = { tiendaId: req.tiendaId };
      if (activo !== undefined) where.activo = activo === "true";

      const [data, total] = await Promise.all([
        prisma.cupones.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take
        }),
        prisma.cupones.count({ where })
      ]);

      const p = parseInt(page) || 1;
      return apiResponse(res, {
        status: 200, type: "SUCCESS", code: "CUPONES_LIST", data,
        meta: {
          total, page: p, limit: take,
          totalPages: Math.ceil(total / take),
          hasNextPage: p < Math.ceil(total / take),
          hasPrevPage: p > 1
        }
      });
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
      const cupon = await prisma.cupones.findUnique({ where: { id: req.params.id } });
      if (!cupon || cupon.tiendaId !== req.tiendaId) throw new NotFoundError("Cupón");
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_FOUND", data: cupon });
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
      const data = await prisma.cupones.create({ data: req.body });
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
      const cupon = await prisma.cupones.findUnique({ where: { id: req.params.id } });
      if (!cupon || cupon.tiendaId !== req.tiendaId) throw new NotFoundError("Cupón");

      const data = await prisma.cupones.update({
        where: { id: req.params.id },
        data: req.body
      });
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
      const cupon = await prisma.cupones.findUnique({ where: { id: req.params.id } });
      if (!cupon || cupon.tiendaId !== req.tiendaId) throw new NotFoundError("Cupón");

      await prisma.cupones.delete({ where: { id: req.params.id } });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUPON_DELETED", data: null });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
