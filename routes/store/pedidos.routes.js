import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PedidosRepository from "../../repositories/pedidos.repository.js";
import PedidosService from "../../services/pedidos.service.js";
import { createPedidoSchema } from "../../validators/pedidos.validator.js";

const pedidosRepository = new PedidosRepository(prisma.pedidos);
const pedidosService = new PedidosService(pedidosRepository);

const router = Router();

// ============================================
// POST / - Crear pedido desde el storefront (público)
// ============================================
router.post(
  "/",
  validate({ body: createPedidoSchema }),
  async (req, res, next) => {
    try {
      const data = await pedidosService.create(req.body);
      return apiResponse(res, { status: 201, type: "SUCCESS", code: "PEDIDO_CREATED", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
