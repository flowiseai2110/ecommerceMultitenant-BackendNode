import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import { uploadQr, deleteQr } from "../controllers/metodos-pago-qr.controller.js";
import {
  createMetodoPagoSchema,
  updateMetodoPagoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/metodos-pago.validator.js";

const metodosPagoRepository = new GenericRepository(prisma.metodos_pago, "Método de pago");
const metodosPagoService = new GenericService(metodosPagoRepository, { enableAudit: false });
const metodosPagoController = new GenericController(metodosPagoService, "MetodoPago");

// Resuelve el tiendaId dueño del método de pago cuando la petición no lo trae
// (rutas /:id), para que requireTiendaAccess pueda validar pertenencia.
const resolveMetodoPagoTiendaId = resolveTiendaId(async (req) => {
  const metodoPago = await prisma.metodos_pago.findUnique({
    where: { id: req.params.id },
    select: { tiendaId: true }
  });
  return metodoPago?.tiendaId || null;
});

const router = Router();

// GET - Listar métodos de pago de una tienda (admin)
// Antes no exigía auth/membresía: cualquier usuario autenticado podía pasar
// ?tiendaId=<otra-tienda> y ver sus métodos de pago (filtraciones cross-tenant).
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  metodosPagoController.findAll
);

// GET - Obtener método de pago por ID (admin)
router.get(
  "/:id",
  authMiddleware,
  resolveMetodoPagoTiendaId,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  metodosPagoController.findById
);

// POST - Crear método de pago (admin)
router.post(
  "/",
  authMiddleware,
  requireTiendaAccess("admin"),
  validate({ body: createMetodoPagoSchema }),
  metodosPagoController.create
);

// PUT - Actualizar método de pago (admin)
router.put(
  "/:id",
  authMiddleware,
  resolveMetodoPagoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema, body: updateMetodoPagoSchema }),
  metodosPagoController.update
);

// POST - Subir o reemplazar QR de pago del método (Yape/Plin/etc.)
router.post(
  "/:id/qr",
  authMiddleware,
  validate({ params: idParamSchema }),
  uploadImage.single("file"),
  resolveMetodoPagoTiendaId,
  requireTiendaAccess("admin"),
  uploadQr
);

// DELETE - Quitar QR de pago del método
router.delete(
  "/:id/qr",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveMetodoPagoTiendaId,
  requireTiendaAccess("admin"),
  deleteQr
);

// DELETE - Eliminar método de pago (admin)
router.delete(
  "/:id",
  authMiddleware,
  resolveMetodoPagoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  metodosPagoController.delete
);

export default router;
