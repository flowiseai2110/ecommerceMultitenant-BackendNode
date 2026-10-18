import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import PedidosService from "./pedidos.service.js";
import {
  updateEstadoSchema,
  updateEstadoPagoSchema,
  updateDetallesSchema,
  idParamSchema,
  paginationSchema,
  listaQuerySchema,
  pendientesCountQuerySchema
} from "./pedidos.schema.js";
import {
  getPendientesCount,
  setPendientesCount
} from "./pedidos-pendientes-cache.js";

const pedidosService = new PedidosService();

const router = Router();

// Resuelve tiendaId desde el pedido cuando no viene en la request
async function resolvePedidoTiendaId(req, res, next) {
  if (!req.body?.tiendaId && !req.params?.tiendaId && !req.query?.tiendaId) {
    const tiendaId = await pedidosService.resolveTiendaId(req.params.id);
    if (tiendaId) req.params.tiendaId = tiendaId;
  }
  next();
}

// GET / - Listar pedidos (requiere tiendaId en query)
router.get(
  "/",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: paginationSchema }),
  async (req, res) => {
    const query = req.validatedQuery || req.query;
    const { data, meta } = await pedidosService.findAll(query);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDOS_LIST", data, meta });
  }
);

// GET /lista - Listado optimizado para tabla del admin
router.get(
  "/lista",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: listaQuerySchema }),
  async (req, res) => {
    const query = req.validatedQuery || req.query;
    const { data, meta } = await pedidosService.findLista(query);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDOS_LISTA", data, meta });
  }
);

// GET /pendientes/count - Conteo de pedidos pendientes (badge del admin)
// Servido desde caché en memoria; solo toca la DB en cache miss.
router.get(
  "/pendientes/count",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ query: pendientesCountQuerySchema }),
  async (req, res) => {
    const { tiendaId } = req.validatedQuery || req.query;

    let total = getPendientesCount(tiendaId);
    if (total === null) {
      total = await pedidosService.countPendientes(tiendaId);
      setPendientesCount(tiendaId, total);
    }

    return apiResponse(res, {
      status: 200,
      type: "SUCCESS",
      code: "PEDIDOS_PENDIENTES_COUNT",
      data: { total }
    });
  }
);

// GET /:id - Obtener pedido por ID
router.get(
  "/:id",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const data = await pedidosService.findById(req.params.id, req.tiendaId);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_FOUND", data });
  }
);

// PUT /:id/estado - Actualizar estado
router.put(
  "/:id/estado",
  authMiddleware,
  resolvePedidoTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateEstadoSchema }),
  async (req, res) => {
    const { estado, notas } = req.body;
    const data = await pedidosService.updateEstado(
      req.params.id, estado, notas, req.user, req.tiendaId
    );
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_ESTADO_UPDATED", data });
  }
);

// PUT /:id/pago - Actualizar estado de pago
router.put(
  "/:id/pago",
  authMiddleware,
  resolvePedidoTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateEstadoPagoSchema }),
  async (req, res) => {
    const { estadoPago, referenciaPago, metodoPago } = req.body;
    const data = await pedidosService.updatePago(
      req.params.id, estadoPago, referenciaPago, metodoPago, req.user, req.tiendaId
    );
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_PAGO_UPDATED", data });
  }
);

// PUT /:id/detalles - Actualizar detalles logísticos
router.put(
  "/:id/detalles",
  authMiddleware,
  resolvePedidoTiendaId,
  requireTiendaAccess("editor"),
  validate({ params: idParamSchema, body: updateDetallesSchema }),
  async (req, res) => {
    const data = await pedidosService.updateDetalles(
      req.params.id, req.body, req.user, req.tiendaId
    );
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_DETALLES_UPDATED", data });
  }
);

// DELETE /:id - Eliminar pedido
router.delete(
  "/:id",
  authMiddleware,
  resolvePedidoTiendaId,
  requireTiendaAccess("admin"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    await pedidosService.delete(req.params.id, req.tiendaId);
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PEDIDO_DELETED", data: null });
  }
);

export default router;
