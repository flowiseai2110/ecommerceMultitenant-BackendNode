import { Prisma } from "@prisma/client";
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
      origen = "web",
      codigoCupon = null
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

      // 4. Validar cupón e incrementar uso si viene en el pedido
      let codigoCuponGuardado = null;
      if (codigoCupon) {
        const codigoNorm = codigoCupon.toUpperCase();
        const now = new Date();
        const cupon = await tx.cupones.findFirst({
          where: { tiendaId, codigo: codigoNorm, activo: true }
        });

        if (!cupon) throw new ValidationError("Cupón no válido");
        if (cupon.fechaInicio && cupon.fechaInicio > now) throw new ValidationError("Cupón aún no vigente");
        if (cupon.fechaFin && cupon.fechaFin < now) throw new ValidationError("Cupón expirado");
        if (cupon.usoMaximo !== null && cupon.usoActual >= cupon.usoMaximo)
          throw new ValidationError("Cupón agotado");

        // Verificar límite por cliente (cliente ya fue creado/actualizado en paso 2)
        if (cupon.usoMaximoPorCliente !== null) {
          const usosCliente = await tx.pedidos.count({
            where: { tiendaId, clienteId: cliente.id, codigoCupon: codigoNorm }
          });
          if (usosCliente >= cupon.usoMaximoPorCliente) {
            throw new ValidationError("Ya usaste este cupón el máximo de veces permitido");
          }
        }

        await tx.cupones.update({
          where: { id: cupon.id },
          data: { usoActual: { increment: 1 } }
        });
        codigoCuponGuardado = codigoNorm;
      }

      // 5. Generar número de pedido con advisory lock (sin race condition)
      const numeroPedido = await this.#generarNumeroPedido(tiendaId, tx);

      // 6. Crear pedido con detalles e historial inicial
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
          codigoCupon: codigoCuponGuardado,
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

      // 7. Descontar stock (stock ya validado arriba)
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

      // 8. Actualizar estadísticas del cliente
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
          codigoCupon: true,
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
   * Obtiene el tiendaId de un pedido dado su id.
   * Usado para resolver el scope multi-tenant cuando el cliente no lo envía.
   */
  async resolveTiendaId(pedidoId) {
    const pedido = await prisma.pedidos.findUnique({
      where: { id: pedidoId },
      select: { tiendaId: true }
    });
    return pedido?.tiendaId || null;
  }

  /**
   * Listado compacto de pedidos para la tabla del admin.
   * Devuelve solo los campos necesarios para el resumen.
   */
  async findResumen(query = {}) {
    const { page = 1, limit = 20, tiendaId, estado } = query;

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = ((parseInt(page) || 1) - 1) * take;

    const where = { tiendaId };
    if (estado) where.estado = estado;

    const [data, total] = await Promise.all([
      prisma.pedidos.findMany({
        where,
        orderBy: { fechaRegistro: "desc" },
        select: {
          id: true,
          numeroPedido: true,
          estado: true,
          total: true,
          fechaRegistro: true,
          cliente: { select: { nombre: true } }
        },
        skip,
        take
      }),
      prisma.pedidos.count({ where })
    ]);

    const p = parseInt(page) || 1;
    return {
      data,
      meta: {
        total,
        page: p,
        limit: take,
        totalPages: Math.ceil(total / take),
        hasNextPage: p < Math.ceil(total / take),
        hasPrevPage: p > 1
      }
    };
  }

  /**
   * Listado optimizado para la tabla del admin.
   * Una sola query con JOIN a clientes — sin detalles ni historial.
   * Índice usado: idx_pedidos_tienda_fecha (tiendaId, fechaRegistro DESC)
   */
  async findLista(query = {}) {
    const {
      tiendaId,
      page = 1,
      limit = 10,
      orderBy = "fechaRegistro:desc",
      estado,
      estadoPago,
    } = query;

    const take = Math.min(parseInt(limit) || 10, 100);
    const skip = ((parseInt(page) || 1) - 1) * take;

    // Whitelist: campo de la query → columna real en DB
    const ORDER_FIELD_MAP = {
      fechaRegistro: "p.fecha_registro",
      total: "p.total",
      numeroPedido: "p.numero_pedido",
      estado: "p.estado",
    };
    const [rawField, rawDir = "desc"] = (orderBy || "fechaRegistro:desc").split(":");
    const orderCol = ORDER_FIELD_MAP[rawField] ?? "p.fecha_registro";
    const orderDir = rawDir.toLowerCase() === "asc" ? "ASC" : "DESC";

    // Construir WHERE dinámico con parámetros seguros
    const conditions = [Prisma.sql`p.tienda_id = ${tiendaId}::uuid`];
    if (estado) conditions.push(Prisma.sql`p.estado = ${estado}`);
    if (estadoPago) conditions.push(Prisma.sql`p.estado_pago = ${estadoPago}`);
    const whereClause = Prisma.join(conditions, " AND ");

    // Una sola query: datos + total via window function (elimina el COUNT separado)
    const rows = await prisma.$queryRaw`
      SELECT
        p.id,
        p.numero_pedido    AS "numeroPedido",
        p.codigo_cupon     AS "codigoCupon",
        p.estado,
        p.estado_pago      AS "estadoPago",
        p.total,
        p.cliente_id       AS "clienteId",
        p.fecha_registro   AS "fechaRegistro",
        c.id               AS "cId",
        c.nombre           AS "clienteNombre",
        c.email            AS "clienteEmail",
        c.whatsapp_numero  AS "clienteWhatsapp",
        COUNT(*) OVER()    AS "totalCount"
      FROM pedidos p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE ${whereClause}
      ORDER BY ${Prisma.raw(orderCol)} ${Prisma.raw(orderDir)}
      LIMIT ${take} OFFSET ${skip}
    `;

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;

    const data = rows.map((row) => ({
      id: row.id,
      numeroPedido: row.numeroPedido,
      codigoCupon: row.codigoCupon ?? null,
      estado: row.estado,
      estadoPago: row.estadoPago,
      total: parseFloat(row.total),
      clienteId: row.clienteId ?? null,
      fechaRegistro: row.fechaRegistro,
      cliente: row.cId
        ? {
            id: row.cId,
            nombre: row.clienteNombre,
            email: row.clienteEmail ?? null,
            whatsappNumero: row.clienteWhatsapp ?? null,
          }
        : null,
    }));

    const p = parseInt(page) || 1;
    return {
      data,
      meta: {
        page: p,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        hasNextPage: p < Math.ceil(total / take),
        hasPrevPage: p > 1,
      },
    };
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
