import { prisma } from "../config/prisma.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

/**
 * Servicio de pedidos con lógica de negocio completa:
 * - Generación de número de pedido sin race condition (advisory lock)
 * - Validación de stock antes de crear
 * - Upsert de cliente por WhatsApp
 * - Actualización de estadísticas del cliente
 * - Reposición de stock y reversión de estadísticas al cancelar
 */
class PedidosService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Genera el siguiente número de pedido para una tienda.
   * Usa pg_advisory_xact_lock para evitar race conditions bajo concurrencia.
   * Usa MAX sobre el campo parseado para ser robusto ante eliminaciones.
   */
  async #generarNumeroPedido(tiendaId, tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pedido_num_${tiendaId}`}))`;

    const result = await tx.$queryRaw`
      SELECT COALESCE(MAX(CAST(REPLACE(numero_pedido, 'PED-', '') AS INTEGER)), 0) AS max_num
      FROM pedidos
      WHERE tienda_id = ${tiendaId}::uuid
    `;

    const maxNum = Number(result[0]?.max_num ?? 0);
    return `PED-${String(maxNum + 1).padStart(4, "0")}`;
  }

  /**
   * Verifica stock suficiente para cada item antes de crear el pedido.
   * Lanza ValidationError si algún item no tiene stock disponible.
   */
  async #validarStock(detalles, tx) {
    for (const item of detalles) {
      if (!item.productoId) continue;

      if (item.varianteId) {
        const variante = await tx.producto_variantes.findUnique({
          where: { id: item.varianteId },
          select: { stock: true, activo: true }
        });

        if (!variante || !variante.activo) {
          throw new ValidationError(
            `Variante "${item.varianteNombre || item.varianteId}" no disponible`
          );
        }
        if (variante.stock < item.cantidad) {
          throw new ValidationError(
            `Stock insuficiente para "${item.varianteNombre}". Disponible: ${variante.stock}, solicitado: ${item.cantidad}`
          );
        }
      } else {
        const producto = await tx.productos.findUnique({
          where: { id: item.productoId },
          select: { stock: true, activo: true, esServicio: true }
        });

        if (!producto || !producto.activo) {
          throw new ValidationError(
            `Producto "${item.productoNombre}" no disponible`
          );
        }
        // Los servicios no tienen stock físico
        if (!producto.esServicio && producto.stock < item.cantidad) {
          throw new ValidationError(
            `Stock insuficiente para "${item.productoNombre}". Disponible: ${producto.stock}, solicitado: ${item.cantidad}`
          );
        }
      }
    }
  }

  /**
   * Busca un cliente por WhatsApp dentro de una tienda.
   * Si no existe lo crea. Si existe actualiza nombre/email.
   */
  async #upsertCliente(tiendaId, clienteData, tx) {
    let cliente = await tx.clientes.findFirst({
      where: { tiendaId, whatsappNumero: clienteData.whatsappNumero }
    });

    if (!cliente) {
      cliente = await tx.clientes.create({
        data: {
          tiendaId,
          whatsappNumero: clienteData.whatsappNumero,
          nombre: clienteData.nombre,
          email: clienteData.email || null,
          tipoDocumento: clienteData.tipoDocumento || null,
          numeroDocumento: clienteData.numeroDocumento || null,
          fechaRegistro: new Date(),
          usuarioRegistro: "storefront"
        }
      });
    } else {
      cliente = await tx.clientes.update({
        where: { id: cliente.id },
        data: {
          nombre: clienteData.nombre,
          email: clienteData.email || cliente.email,
          fechaActualizacion: new Date()
        }
      });
    }

    return cliente;
  }

  /**
   * Crea un pedido completo en una sola transacción:
   * 1. Valida stock
   * 2. Upsert cliente
   * 3. Calcula totales
   * 4. Genera número de pedido (sin race condition)
   * 5. Crea pedido + detalles + historial
   * 6. Descuenta stock
   * 7. Actualiza estadísticas del cliente
   */
  async create(data) {
    const {
      tiendaId,
      cliente: clienteData,
      detalles,
      costoEnvio = 0,
      descuentoMonto = 0,
      notas,
      metodoPago,
      metodoEnvio,
      direccionEnvio,
      origen = "web"
    } = data;

    return await prisma.$transaction(async (tx) => {
      // 1. Validar stock antes de cualquier modificación
      await this.#validarStock(detalles, tx);

      // 2. Buscar o crear cliente
      const cliente = await this.#upsertCliente(tiendaId, clienteData, tx);

      // 3. Calcular totales
      const itemsConTotal = detalles.map(item => {
        const totalItem = (item.precioUnitario * item.cantidad) - (item.descuento || 0);
        return { ...item, total: Math.round(totalItem * 100) / 100 };
      });

      const subtotal = itemsConTotal.reduce((sum, item) => sum + item.total, 0);
      const total = Math.round((subtotal - descuentoMonto + costoEnvio) * 100) / 100;

      // 4. Generar número de pedido con advisory lock (sin race condition)
      const numeroPedido = await this.#generarNumeroPedido(tiendaId, tx);

      // 5. Crear pedido con detalles e historial inicial
      const pedido = await tx.pedidos.create({
        data: {
          tiendaId,
          clienteId: cliente.id,
          numeroPedido,
          estado: "pendiente",
          subtotal,
          descuentoMonto,
          costoEnvio,
          total,
          metodoPago: metodoPago || null,
          estadoPago: "pendiente",
          metodoEnvio: metodoEnvio || null,
          direccionEnvio: direccionEnvio || null,
          notas: notas || null,
          origen,
          fechaRegistro: new Date(),
          usuarioRegistro: "storefront",
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
          historialEstados: {
            create: { estado: "pendiente", notas: "Pedido creado desde storefront" }
          }
        },
        include: {
          detalles: true,
          historialEstados: true,
          cliente: true
        }
      });

      // 6. Descontar stock (stock ya validado arriba)
      for (const item of detalles) {
        if (!item.productoId) continue;
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

      // 7. Actualizar estadísticas del cliente
      await tx.clientes.update({
        where: { id: cliente.id },
        data: {
          totalPedidos: { increment: 1 },
          totalGastado: { increment: total },
          ultimoPedidoFecha: new Date()
        }
      });

      return pedido;
    });
  }

  /**
   * Lista pedidos con paginación y filtros.
   * Incluye cliente y detalles en cada resultado.
   * Acepta tiendaId como filtro para scope multi-tenant.
   */
  async findAll(query = {}) {
    const { page = 1, limit = 10, orderBy, ...filters } = query;

    const take = Math.min(parseInt(limit) || 10, 100);
    const skip = ((parseInt(page) || 1) - 1) * take;

    const where = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") continue;
      if (value === "true") where[key] = true;
      else if (value === "false") where[key] = false;
      else where[key] = value;
    }

    let orderByClause = { fechaRegistro: "desc" };
    if (orderBy) {
      const [field, dir = "asc"] = orderBy.split(":");
      orderByClause = { [field]: dir.toLowerCase() };
    }

    const [data, total] = await Promise.all([
      prisma.pedidos.findMany({
        where,
        orderBy: orderByClause,
        select: {
          id: true,
          tiendaId: true,
          numeroPedido: true,
          estado: true,
          estadoPago: true,
          subtotal: true,
          descuentoMonto: true,
          costoEnvio: true,
          total: true,
          metodoPago: true,
          metodoEnvio: true,
          origen: true,
          notas: true,
          fechaConfirmado: true,
          fechaEntregado: true,
          fechaRegistro: true,
          cliente: {
            select: { id: true, nombre: true, whatsappNumero: true, email: true }
          },
          detalles: {
            select: {
              id: true,
              productoNombre: true,
              varianteNombre: true,
              cantidad: true,
              precioUnitario: true,
              descuento: true,
              total: true
            }
          }
        },
        skip,
        take
      }),
      prisma.pedidos.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page: parseInt(page) || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: (parseInt(page) || 1) < Math.ceil(total / take),
        hasPrevPage: (parseInt(page) || 1) > 1
      }
    };
  }

  /**
   * Obtiene un pedido por ID con detalles, cliente e historial.
   * Si se provee tiendaId, verifica que el pedido pertenezca a esa tienda (retorna 404 si no).
   */
  async findById(id, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({
      where: { id },
      include: {
        detalles: true,
        cliente: {
          select: {
            id: true,
            nombre: true,
            whatsappNumero: true,
            email: true,
            tipoDocumento: true,
            numeroDocumento: true,
            direccionPredeterminada: true
          }
        },
        historialEstados: { orderBy: { fechaRegistro: "desc" } }
      }
    });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    return pedido;
  }

  /**
   * Actualiza el estado de un pedido.
   * - Registra el cambio en historial_estados
   * - Marca fechaConfirmado / fechaEntregado según corresponda
   * - Si se cancela: repone stock y revierte estadísticas del cliente
   * Si se provee tiendaId, verifica que el pedido pertenezca a esa tienda.
   */
  async updateEstado(id, estado, notas, user, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({ where: { id } });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    return await prisma.$transaction(async (tx) => {
      const updateData = {
        estado,
        fechaActualizacion: new Date(),
        usuarioActualizacion: user?.email || user?.id || "system"
      };

      if (estado === "confirmado" && !pedido.fechaConfirmado) {
        updateData.fechaConfirmado = new Date();
      }
      if (estado === "entregado" && !pedido.fechaEntregado) {
        updateData.fechaEntregado = new Date();
      }

      // Cancelación: reponer stock y revertir estadísticas del cliente
      if (estado === "cancelado" && pedido.estado !== "cancelado") {
        const detalles = await tx.pedido_detalles.findMany({ where: { pedidoId: id } });

        for (const item of detalles) {
          if (!item.productoId) continue;
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

        if (pedido.clienteId) {
          await tx.clientes.update({
            where: { id: pedido.clienteId },
            data: {
              totalPedidos: { decrement: 1 },
              totalGastado: { decrement: pedido.total }
            }
          });
        }
      }

      const updated = await tx.pedidos.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          numeroPedido: true,
          estado: true,
          estadoPago: true,
          fechaConfirmado: true,
          fechaEntregado: true,
          fechaActualizacion: true
        }
      });

      await tx.pedido_historial_estados.create({
        data: {
          pedidoId: id,
          estado,
          notas: notas || `Estado cambiado a: ${estado}`
        }
      });

      return updated;
    });
  }

  /**
   * Actualiza el estado de pago de un pedido.
   * Si se provee tiendaId, verifica pertenencia a la tienda.
   */
  async updatePago(id, estadoPago, referenciaPago, metodoPago, user, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({ where: { id } });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    const updateData = {
      estadoPago,
      fechaActualizacion: new Date(),
      usuarioActualizacion: user?.email || user?.id || "system"
    };

    if (referenciaPago !== undefined) updateData.referenciaPago = referenciaPago;
    if (metodoPago !== undefined) updateData.metodoPago = metodoPago;

    return await prisma.pedidos.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        numeroPedido: true,
        estadoPago: true,
        metodoPago: true,
        referenciaPago: true,
        fechaActualizacion: true
      }
    });
  }

  /**
   * Elimina un pedido por ID.
   * Si se provee tiendaId, verifica pertenencia a la tienda.
   */
  async delete(id, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({ where: { id } });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    return await prisma.pedidos.delete({ where: { id } });
  }
}

export default PedidosService;
