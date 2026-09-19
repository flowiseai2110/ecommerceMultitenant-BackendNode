import { prisma, Prisma } from "../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { invalidatePendientesCount } from "./pedidos-pendientes-cache.js";
import emailService from "../../services/email.service.js";
import { logger } from "../../config/logger.js";
import { validarYBloquearStock, descontarStock, reponerStock } from "../inventario/inventario.service.js";

/**
 * Servicio de Pedidos (contexto Órdenes) con lógica de negocio completa:
 * - Generación de número de pedido sin race condition (advisory lock)
 * - Validación/bloqueo/descuento de stock (delegado al contexto Inventario)
 * - Upsert de cliente por WhatsApp
 * - Actualización de estadísticas del cliente
 * - Reposición de stock y reversión de estadísticas al cancelar
 */
class PedidosService {
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
   * Busca un cliente por WhatsApp dentro de una tienda.
   * Si no existe lo crea. Si existe lo reusa tal cual está:
   * el nombre/email de `clientes` solo lo cambia el propio cliente
   * (ej. desde un futuro perfil/login), nunca un pedido nuevo.
   * Los datos de contacto de ESTE pedido se guardan aparte como
   * snapshot en `pedidos` (ver create), así el historial no se
   * ve afectado por compras posteriores con el mismo WhatsApp.
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
    }

    return cliente;
  }

  /**
   * Crea un pedido completo en una sola transacción:
   * 1. Valida y bloquea stock (Inventario)
   * 2. Upsert cliente
   * 3. Calcula totales
   * 4. Valida cupón
   * 5. Genera número de pedido (sin race condition)
   * 6. Crea pedido + detalles + historial
   * 7. Descuenta stock (Inventario)
   * 8. Actualiza estadísticas del cliente
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
      // 1. Validar stock y bloquear las filas involucradas (FOR UPDATE).
      const { variantesADescontar, productosADescontar } =
        await validarYBloquearStock(tx, tiendaId, detalles);

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
          clienteNombre: clienteData.nombre,
          clienteWhatsapp: clienteData.whatsappNumero,
          clienteEmail: clienteData.email || null,
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
            // createMany garantiza UN solo INSERT para todos los items,
            // sin importar cuántas líneas tenga el pedido
            createMany: {
              data: itemsConTotal.map(item => ({
              productoId: item.productoId || null,
              varianteId: item.varianteId || null,
              productoNombre: item.productoNombre,
              varianteNombre: item.varianteNombre || null,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              descuento: item.descuento || 0,
              total: item.total
              }))
            }
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

      // 7. Descontar stock en batch (filas ya bloqueadas y validadas en el paso 1)
      await descontarStock(tx, variantesADescontar, productosADescontar);

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
    }, {
      // Red de seguridad, NO el fix principal: la transacción ahora hace un
      // número fijo de round-trips (~10) sin importar el tamaño del carrito.
      // El margen extra cubre latencia de red/pooler hacia Supabase.
      maxWait: 5000,
      timeout: 15000
    }).then((pedido) => {
      // Todo pedido nuevo nace "pendiente": el conteo cacheado del badge cambió
      invalidatePendientesCount(tiendaId);
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
          clienteId: true,
          clienteNombre: true,
          clienteWhatsapp: true,
          clienteEmail: true,
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

    // El cliente se arma desde el snapshot guardado en el propio pedido
    // (no desde la ficha actual de `clientes`): así el historial no cambia
    // si el cliente hace otra compra después con datos distintos.
    const mapped = data.map(({ clienteId, clienteNombre, clienteWhatsapp, clienteEmail, ...pedido }) => ({
      ...pedido,
      cliente: clienteId
        ? { id: clienteId, nombre: clienteNombre, whatsappNumero: clienteWhatsapp, email: clienteEmail }
        : null
    }));

    return {
      data: mapped,
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

    // nombre/whatsapp/email mostrados son el snapshot de ESTE pedido, no la
    // ficha actual del cliente. tipoDocumento/numeroDocumento/direccion no
    // se capturan en el checkout, así que esos sí vienen de `clientes`.
    return {
      ...pedido,
      cliente: pedido.cliente
        ? {
            ...pedido.cliente,
            nombre: pedido.clienteNombre,
            whatsappNumero: pedido.clienteWhatsapp,
            email: pedido.clienteEmail
          }
        : null
    };
  }

  /**
   * Actualiza el estado de un pedido.
   * - Registra el cambio en historial_estados
   * - Marca fechaConfirmado / fechaEntregado según corresponda
   * - Si se cancela: repone stock (Inventario) y revierte estadísticas del cliente
   * Si se provee tiendaId, verifica que el pedido pertenezca a esa tienda.
   */
  async updateEstado(id, estado, notas, user, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({ where: { id } });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    const updated = await prisma.$transaction(async (tx) => {
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
        await reponerStock(tx, detalles);

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

    // El conteo del badge solo cambia si el pedido entra o sale de "pendiente"
    if (pedido.estado === "pendiente" || estado === "pendiente") {
      invalidatePendientesCount(pedido.tiendaId);
    }

    return updated;
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
   * Actualiza los detalles logísticos del pedido: método de envío, dirección,
   * comprobante y nota interna. Actualización parcial (solo los campos enviados).
   * No cambia estado ni estadoPago, así que no toca el caché del badge.
   * Si se provee tiendaId, verifica pertenencia a la tienda.
   */
  async updateDetalles(id, data, user, tiendaId = null) {
    const pedido = await prisma.pedidos.findUnique({ where: { id } });

    if (!pedido || (tiendaId && pedido.tiendaId !== tiendaId)) {
      throw new NotFoundError("Pedido");
    }

    const updateData = {
      fechaActualizacion: new Date(),
      usuarioActualizacion: user?.email || user?.id || "system"
    };

    for (const campo of ["metodoEnvio", "direccionEnvio", "comprobante", "notas"]) {
      if (data[campo] !== undefined) updateData[campo] = data[campo];
    }

    await prisma.pedidos.update({ where: { id }, data: updateData });

    // Devuelve el pedido completo (con detalles/cliente) para que el store del
    // admin no pierda total/ítems al hacer merge de una respuesta parcial.
    return this.findById(id, tiendaId);
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
   * Seguimiento público de un pedido por su número, scopeado a la tienda.
   * @param {string} tiendaId - Tienda dueña del pedido (scope multi-tenant).
   * @param {string} numeroPedido - Número visible del pedido (ej. "PED-0001").
   * @returns {Promise<object>} Pedido con detalles e historial.
   * @throws {NotFoundError} si no existe un pedido con ese número en la tienda.
   */
  async rastrear(tiendaId, numeroPedido) {
    const pedido = await prisma.pedidos.findFirst({
      where: { tiendaId, numeroPedido },
      select: {
        id: true,
        numeroPedido: true,
        estado: true,
        estadoPago: true,
        subtotal: true,
        descuentoMonto: true,
        costoEnvio: true,
        total: true,
        codigoCupon: true,
        metodoPago: true,
        metodoEnvio: true,
        direccionEnvio: true,
        notas: true,
        fechaConfirmado: true,
        fechaEntregado: true,
        fechaRegistro: true,
        cliente: { select: { nombre: true } },
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
        },
        historialEstados: {
          select: { estado: true, notas: true, fechaRegistro: true },
          orderBy: { fechaRegistro: "asc" }
        }
      }
    });

    if (!pedido) throw new NotFoundError("Pedido");
    return pedido;
  }

  /**
   * Cuenta los pedidos pendientes de una tienda (fuente para el badge del admin;
   * la capa de ruta se encarga del caché).
   * @param {string} tiendaId - Tienda a contar.
   * @returns {Promise<number>}
   */
  async countPendientes(tiendaId) {
    return prisma.pedidos.count({ where: { tiendaId, estado: "pendiente" } });
  }

  /**
   * Notifica por email al dueño de la tienda que entró un pedido nuevo.
   * Efecto secundario NO bloqueante: cualquier fallo solo se loggea, nunca debe
   * invalidar un pedido ya creado. Se consulta la tienda aquí (y no vía
   * req.tienda) porque resolveTienda no la puebla en desarrollo local sin
   * subdominio, y su caché no incluye los datos de contacto.
   * @param {{ tiendaId: string, numeroPedido: string }} pedido - Pedido recién creado.
   * @returns {Promise<void>}
   */
  async notifyNewOrder(pedido) {
    try {
      const tienda = await prisma.tiendas.findUnique({
        where: { id: pedido.tiendaId },
        select: { nombre: true, email: true, logoUrl: true, moneda: true }
      });
      if (tienda) await emailService.sendNewOrderEmail(pedido, tienda);
    } catch (error) {
      logger.error(`❌ No se pudo notificar por email el pedido ${pedido.numeroPedido}:`, error);
    }
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
          clienteNombre: true
        },
        skip,
        take
      }),
      prisma.pedidos.count({ where })
    ]);

    // Nombre desde el snapshot del pedido, no desde la ficha actual del cliente
    const mapped = data.map(({ clienteNombre, ...pedido }) => ({
      ...pedido,
      cliente: { nombre: clienteNombre }
    }));

    const p = parseInt(page) || 1;
    return {
      data: mapped,
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

    // Nombre/whatsapp/email vienen del snapshot guardado en el propio pedido
    // (no de un JOIN a `clientes`): así el historial no cambia si el cliente
    // hace otra compra después con datos distintos.
    const rows = await prisma.$queryRaw`
      SELECT
        p.id,
        p.numero_pedido     AS "numeroPedido",
        p.codigo_cupon      AS "codigoCupon",
        p.estado,
        p.estado_pago       AS "estadoPago",
        p.total,
        p.cliente_id        AS "clienteId",
        p.cliente_nombre    AS "clienteNombre",
        p.cliente_email     AS "clienteEmail",
        p.cliente_whatsapp  AS "clienteWhatsapp",
        p.fecha_registro    AS "fechaRegistro",
        COUNT(*) OVER()     AS "totalCount"
      FROM pedidos p
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
      cliente: row.clienteId
        ? {
            id: row.clienteId,
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

    const deleted = await prisma.pedidos.delete({ where: { id } });
    if (pedido.estado === "pendiente") {
      invalidatePendientesCount(pedido.tiendaId);
    }
    return deleted;
  }
}

export default PedidosService;
