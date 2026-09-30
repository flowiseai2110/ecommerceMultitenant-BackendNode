import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PedidosService from "./pedidos.service.js";

const pedidosService = new PedidosService();

const router = Router();

// Cuenta del comprador en el storefront (login con Google vía Supabase Auth).
// Todas las rutas exigen JWT: el usuario sale de req.user.id, nunca del
// request, y el tiendaId se fuerza al del subdominio si se resolvió.
const tiendaQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido")
});

// ============================================
// GET /perfil?tiendaId=X — Datos para autocompletar el checkout
// ============================================
router.get(
  "/perfil",
  authMiddleware,
  validate({ query: tiendaQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId } = req.validatedQuery || req.query;
      const ultimoContacto = await pedidosService.ultimoContacto(tiendaId, req.user.id);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "CUENTA_PERFIL",
        data: { ultimoContacto }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /pedidos?tiendaId=X — "Mis pedidos" en esta tienda
// ============================================
router.get(
  "/pedidos",
  authMiddleware,
  validate({ query: tiendaQuerySchema }),
  scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId } = req.validatedQuery || req.query;
      const data = await pedidosService.listByAuthUser(tiendaId, req.user.id);

      return apiResponse(res, { status: 200, type: "SUCCESS", code: "CUENTA_PEDIDOS", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
