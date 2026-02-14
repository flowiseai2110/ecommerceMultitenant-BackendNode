import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import { NotFoundError } from "../utils/errors.js";
import {
  createPedidoSchema,
  updateEstadoSchema,
  updateEstadoPagoSchema,
  idParamSchema,
  paginationSchema
} from "../validators/pedidos.validator.js";

const router = Router();

/**
 * Genera número de pedido secuencial por tienda: PED-0001, PED-0002...
 */
async function generarNumeroPedido(tiendaId, tx) {
  const ultimo = await tx.pedidos.findFirst({
    where: { tiendaId },
    orderBy: { fechaRegistro: "desc" },
    select: { numeroPedido: true }
  });

  let siguiente = 1;
  if (ultimo?.numeroPedido) {
    const num = parseInt(ultimo.numeroPedido.replace("PED-", ""), 10);
    if (!isNaN(num)) siguiente = num + 1;
  }

  return `PED-${String(siguiente).padStart(4, "0")}`;
}

// ============================================
// POST / - Crear pedido (desde storefront)
// ============================================
router.post(
  "/",
  validate({ body: createPedidoSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, cliente, detalles, costoEnvio, descuentoMonto, notas, metodoPago, metodoEnvio, direccionEnvio, origen } = req.body;

      const pedido = await prisma.$transaction(async (tx) => {
        // 1. Buscar o crear cliente
        let clienteRecord = await tx.clientes.findFirst({
          where: { tiendaId, whatsappNumero: cliente.whatsappNumero }
        });

        if (!clienteRecord) {
          clienteRecord = await tx.clientes.create({
            data: {
              tiendaId,
              whatsappNumero: cliente.whatsappNumero,
              nombre: cliente.nombre,
              email: cliente.email || null,
              tipoDocumento: cliente.tipoDocumento || null,
              numeroDocumento: cliente.numeroDocumento || null,
              fechaRegistro: new Date(),
              usuarioRegistro: "storefront"
            }
          });
        } else {
          // Actualizar nombre/email si cambiaron
          clienteRecord = await tx.clientes.update({
            where: { id: clienteRecord.id },
            data: {
              nombre: cliente.nombre,
              email: cliente.email || clienteRecord.email,
              fechaActualizacion: new Date()
            }
          });
        }

        // 2. Calcular totales
        const itemsConTotal = detalles.map(item => {
          const totalItem = (item.precioUnitario * item.cantidad) - (item.descuento || 0);
          return { ...item, total: Math.round(totalItem * 100) / 100 };
        });

        const subtotal = itemsConTotal.reduce((sum, item) => sum + item.total, 0);
        const total = Math.round((subtotal - (descuentoMonto || 0) + (costoEnvio || 0)) * 100) / 100;

        // 3. Generar número de pedido
        const numeroPedido = await generarNumeroPedido(tiendaId, tx);

        // 4. Crear pedido
        const nuevoPedido = await tx.pedidos.create({
          data: {
            tiendaId,
            clienteId: clienteRecord.id,
            numeroPedido,
            estado: "pendiente",
            subtotal,
            descuentoMonto: descuentoMonto || 0,
            costoEnvio: costoEnvio || 0,
            total,
            metodoPago: metodoPago || null,
            estadoPago: "pendiente",
            metodoEnvio: metodoEnvio || null,
            direccionEnvio: direccionEnvio || null,
            notas: notas || null,
            origen: origen || "web",
            fechaRegistro: new Date(),
            usuarioRegistro: "storefront",
            // Crear detalles en la misma operación
            detalles: {
              create: itemsConTotal.map(item => ({
                productoId: item.productoId || null,
                varianteId: item.varianteId || null,
                productoNombre: item.productoNombre,
                varianteNombre: item.varianteNombre || null,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                descuento: item.descuento || 0,
                total: item.total
              }))
            },
            // Crear primer estado en historial
            historialEstados: {
              create: {
                estado: "pendiente",
                notas: "Pedido creado desde storefront"
              }
            }
          },
          include: {
            detalles: true,
            historialEstados: true,
            cliente: true
          }
        });

        // 5. Descontar stock de productos
        for (const item of detalles) {
          if (item.productoId) {
            if (item.varianteId) {
              await tx.producto_variantes.update({
                where: { id: item.varianteId },
                data: { stock: { decrement: item.cantidad } }
              });
            } else {
              await tx.productos.update({
                where: { id: item.productoId },
                data: { stock: { decrement: item.cantidad } }
              });
            }
          }
        }

        return nuevoPedido;
      });

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "PEDIDO_CREATED",
        data: pedido
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET / - Listar pedidos (con filtros)
// ============================================
router.get(
  "/",
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const { page = 1, limit = 10, orderBy, ...filters } = query;

      const take = Math.min(parseInt(limit) || 10, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;

      // Construir where con conversión de tipos
      const where = {};
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === "") continue;
        if (value === "true") where[key] = true;
        else if (value === "false") where[key] = false;
        else where[key] = value;
      }

      // Parsear orderBy
      let orderByClause = { fechaRegistro: "desc" };
      if (orderBy) {
        const [field, dir = "asc"] = orderBy.split(":");
        orderByClause = { [field]: dir.toLowerCase() };
      }

      const [data, total] = await Promise.all([
        prisma.pedidos.findMany({
          where,
          orderBy: orderByClause,
          include: {
            detalles: true,
            cliente: { select: { id: true, nombre: true, whatsappNumero: true, email: true } },
            historialEstados: { orderBy: { fechaRegistro: "desc" } }
          },
          skip,
          take
        }),
        prisma.pedidos.count({ where })
      ]);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDOS_LIST",
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
// GET /:id - Obtener pedido por ID
// ============================================
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const pedido = await prisma.pedidos.findUnique({
        where: { id: req.params.id },
        include: {
          detalles: true,
          cliente: true,
          historialEstados: { orderBy: { fechaRegistro: "desc" } }
        }
      });

      if (!pedido) {
        throw new NotFoundError("Pedido");
      }

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDO_FOUND",
        data: pedido
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id/estado - Actualizar estado del pedido
// ============================================
router.put(
  "/:id/estado",
  validate({ params: idParamSchema, body: updateEstadoSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { estado, notas } = req.body;

      const pedido = await prisma.pedidos.findUnique({ where: { id } });
      if (!pedido) {
        throw new NotFoundError("Pedido");
      }

      const pedidoActualizado = await prisma.$transaction(async (tx) => {
        // Datos a actualizar
        const updateData = {
          estado,
          fechaActualizacion: new Date(),
          usuarioActualizacion: req.user?.email || "system"
        };

        // Marcar fechas especiales
        if (estado === "confirmado" && !pedido.fechaConfirmado) {
          updateData.fechaConfirmado = new Date();
        }
        if (estado === "entregado" && !pedido.fechaEntregado) {
          updateData.fechaEntregado = new Date();
        }

        // Si se cancela, reponer stock
        if (estado === "cancelado" && pedido.estado !== "cancelado") {
          const detalles = await tx.pedido_detalles.findMany({ where: { pedidoId: id } });
          for (const item of detalles) {
            if (item.productoId) {
              if (item.varianteId) {
                await tx.producto_variantes.update({
                  where: { id: item.varianteId },
                  data: { stock: { increment: item.cantidad } }
                });
              } else {
                await tx.productos.update({
                  where: { id: item.productoId },
                  data: { stock: { increment: item.cantidad } }
                });
              }
            }
          }
        }

        // Actualizar pedido
        const updated = await tx.pedidos.update({
          where: { id },
          data: updateData,
          include: {
            detalles: true,
            cliente: true,
            historialEstados: { orderBy: { fechaRegistro: "desc" } }
          }
        });

        // Registrar en historial
        await tx.pedido_historial_estados.create({
          data: {
            pedidoId: id,
            estado,
            notas: notas || `Estado cambiado a: ${estado}`
          }
        });

        return updated;
      });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDO_ESTADO_UPDATED",
        data: pedidoActualizado
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /:id/pago - Actualizar estado de pago
// ============================================
router.put(
  "/:id/pago",
  validate({ params: idParamSchema, body: updateEstadoPagoSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { estadoPago, referenciaPago, metodoPago } = req.body;

      const pedido = await prisma.pedidos.findUnique({ where: { id } });
      if (!pedido) {
        throw new NotFoundError("Pedido");
      }

      const updateData = {
        estadoPago,
        fechaActualizacion: new Date(),
        usuarioActualizacion: req.user?.email || "system"
      };

      if (referenciaPago !== undefined) updateData.referenciaPago = referenciaPago;
      if (metodoPago !== undefined) updateData.metodoPago = metodoPago;

      const pedidoActualizado = await prisma.pedidos.update({
        where: { id },
        data: updateData,
        include: {
          detalles: true,
          cliente: true,
          historialEstados: { orderBy: { fechaRegistro: "desc" } }
        }
      });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDO_PAGO_UPDATED",
        data: pedidoActualizado
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /:id - Eliminar pedido
// ============================================
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const pedido = await prisma.pedidos.findUnique({ where: { id: req.params.id } });
      if (!pedido) {
        throw new NotFoundError("Pedido");
      }

      await prisma.pedidos.delete({ where: { id: req.params.id } });

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "PEDIDO_DELETED",
        data: null
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
