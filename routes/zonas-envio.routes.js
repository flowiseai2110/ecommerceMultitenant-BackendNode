import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError } from "../utils/errors.js";
import {
  createZonaEnvioSchema,
  updateZonaEnvioSchema,
  idParamSchema,
  paginationSchema
} from "../validators/zonas-envio.validator.js";

const router = Router();

// ============================================
// GET / - Listar zonas de envío (público para storefront)
// ============================================
router.get(
  "/",
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const { page = 1, limit = 50, orderBy, ...filters } = query;

      const take = Math.min(parseInt(limit) || 50, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;

      const where = {};
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === "") continue;
        if (value === "true") where[key] = true;
        else if (value === "false") where[key] = false;
        else where[key] = value;
      }

      let orderByClause = { nombre: "asc" };
      if (orderBy) {
        const [field, dir = "asc"] = orderBy.split(":");
        orderByClause = { [field]: dir.toLowerCase() };
      }

      const [data, total] = await Promise.all([
        prisma.zonas_envio.findMany({
          where,
          orderBy: orderByClause,
          include: { ubigeos: true },
          skip,
          take
        }),
        prisma.zonas_envio.count({ where })
      ]);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "ZONAS_ENVIO_LIST",
        data: {
          data,
          meta: {
            total,
            page: parseInt(page) || 1,
            limit: take,
            totalPages: Math.ceil(total / take),
            hasNextPage: (parseInt(page) || 1) < Math.ceil(total / take),
            hasPrevPage: (parseInt(page) || 1) > 1
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /:id - Obtener zona de envío por ID
// ============================================
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const zona = await prisma.zonas_envio.findUnique({
        where: { id: req.params.id },
        include: { ubigeos: true }
      });

      if (!zona) {
        throw new NotFoundError("Zona de envío");
      }

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "ZONA_ENVIO_FOUND",
        data: zona
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST / - Crear zona de envío con ubigeos (admin)
// ============================================
router.post(
  "/",
  authMiddleware,
  validate({ body: createZonaEnvioSchema }),
  async (req, res, next) => {
    try {
      const { ubigeos, ...zonaData } = req.body;

      const zona = await prisma.zonas_envio.create({
        data: {
          ...zonaData,
          ubigeos: ubigeos.length > 0
            ? { create: ubigeos.map(u => ({ ubigeo: u })) }
            : undefined
        },
        include: { ubigeos: true }
      });

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "ZONA_ENVIO_CREATED",
        data: zona
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id - Actualizar zona de envío (admin)
// Reemplaza ubigeos si se envían
// ============================================
router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateZonaEnvioSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { ubigeos, ...zonaData } = req.body;

      const existe = await prisma.zonas_envio.findUnique({ where: { id } });
      if (!existe) {
        throw new NotFoundError("Zona de envío");
      }

      const zona = await prisma.$transaction(async (tx) => {
        // Si se envían ubigeos, reemplazar todos
        if (ubigeos !== undefined) {
          await tx.zona_envio_ubigeos.deleteMany({ where: { zonaEnvioId: id } });

          if (ubigeos.length > 0) {
            await tx.zona_envio_ubigeos.createMany({
              data: ubigeos.map(u => ({ zonaEnvioId: id, ubigeo: u }))
            });
          }
        }

        // Actualizar zona (solo si hay campos además de ubigeos)
        const hasZonaFields = Object.keys(zonaData).length > 0;
        if (hasZonaFields) {
          return await tx.zonas_envio.update({
            where: { id },
            data: zonaData,
            include: { ubigeos: true }
          });
        }

        return await tx.zonas_envio.findUnique({
          where: { id },
          include: { ubigeos: true }
        });
      });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "ZONA_ENVIO_UPDATED",
        data: zona
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /:id - Eliminar zona de envío (admin)
// ============================================
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const existe = await prisma.zonas_envio.findUnique({ where: { id: req.params.id } });
      if (!existe) {
        throw new NotFoundError("Zona de envío");
      }

      await prisma.zonas_envio.delete({ where: { id: req.params.id } });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "ZONA_ENVIO_DELETED",
        data: null
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
