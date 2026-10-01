import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess, resolveTiendaId } from "../../kernel/tenant/index.js";
import {
  createMetodoEnvioSchema,
  updateMetodoEnvioSchema,
  idParamSchema,
  paginationSchema
} from "./metodos-envio.schema.js";
import { replaceZonasSchema } from "./zonas-envio.schema.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { NotFoundError } from "../../utils/errors.js";

const metodosEnvioRepository = new GenericRepository(prisma.metodos_envio, "Método de envío");
const metodosEnvioService = new GenericService(metodosEnvioRepository, { enableAudit: false });
const metodosEnvioController = new GenericController(metodosEnvioService, "MetodoEnvio");

// Resuelve el tiendaId dueño del método de envío cuando la petición no lo trae
// (rutas /:id), para que requireTiendaAccess pueda validar pertenencia.
const resolveMetodoEnvioTiendaId = resolveTiendaId(
  (req) => metodosEnvioRepository.findTiendaIdById(req.params.id)
);

const router = Router();

// GET - Listar métodos de envío de una tienda (admin)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  metodosEnvioController.findAll
);

// GET - Obtener método de envío por ID (admin)
router.get(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  metodosEnvioController.findById
);

// POST - Crear método de envío (admin)
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: createMetodoEnvioSchema }),
  metodosEnvioController.create
);

// PUT - Actualizar método de envío (admin)
router.put(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: updateMetodoEnvioSchema }),
  metodosEnvioController.update
);

// DELETE - Eliminar método de envío (admin)
router.delete(
  "/:id",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  metodosEnvioController.delete
);

// GET - Zonas y tarifas del método (admin)
router.get(
  "/:id/zonas",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const data = await prisma.zonas_envio.findMany({
        where: { metodoEnvioId: req.params.id },
        orderBy: { orden: "asc" }
      });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONAS_ENVIO_LIST", data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT - Reemplaza todas las zonas del método en una transacción (admin)
router.put(
  "/:id/zonas",
  authMiddleware,
  resolveMetodoEnvioTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: replaceZonasSchema }),
  async (req, res, next) => {
    try {
      const metodo = await prisma.metodos_envio.findUnique({
        where: { id: req.params.id },
        select: { id: true, tiendaId: true }
      });
      if (!metodo) throw new NotFoundError("Método de envío no encontrado");

      const data = await prisma.$transaction(async (tx) => {
        await tx.zonas_envio.deleteMany({ where: { metodoEnvioId: metodo.id } });
        if (req.body.zonas.length) {
          await tx.zonas_envio.createMany({
            data: req.body.zonas.map((z, i) => ({
              tiendaId: metodo.tiendaId,
              metodoEnvioId: metodo.id,
              nombre: z.nombre,
              costo: z.costo,
              diasMin: z.diasMin ?? null,
              diasMax: z.diasMax ?? null,
              ubigeos: z.ubigeos,
              orden: i
            }))
          });
        }
        return tx.zonas_envio.findMany({ where: { metodoEnvioId: metodo.id }, orderBy: { orden: "asc" } });
      });
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "ZONAS_ENVIO_UPDATED", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
