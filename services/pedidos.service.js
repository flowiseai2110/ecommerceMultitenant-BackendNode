import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { invalidatePendientesCount } from "./pedidos-pendientes-cache.js";

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
   * Valida y BLOQUEA el stock de todos los items en 2 queries fijas
   * (una por tabla), sin importar cuántos items tenga el pedido.
   *
   * - Agrupa cantidades por producto/variante: el mismo item puede venir en
   *   varias líneas del carrito y debe validarse contra la suma total.
   * - SELECT ... FOR UPDATE bloquea las filas hasta el commit: dos pedidos
   *   concurrentes sobre el mismo producto se serializan aquí, así el que
   *   llega segundo ve el stock ya descontado (elimina el oversell).
   * - Los ids se ordenan para que transacciones concurrentes adquieran los
   *   locks en el mismo orden y no se produzcan deadlocks.
   * - Filtra por tiendaId (scope multi-tenant).
   *
   * Devuelve las listas agregadas listas para el descuento batcheado;
   * los productos tipo servicio quedan excluidos (no manejan stock físico).
   */
  async #validarYBloquearStock(tiendaId, detalles, tx) {
    const cantidadesVariante = new Map();
    const cantidadesProducto = new Map();
    const nombrePorId = new Map();

    for (const item of detalles) {
      if (!item.productoId) continue;
      if (item.varianteId) {
        cantidadesVariante.set(
          item.varianteId,
          (cantidadesVariante.get(item.varianteId) || 0) + item.cantidad
        );
        nombrePorId.set(item.varianteId, item.varianteNombre || item.varianteId);
      } else {
        cantidadesProducto.set(
          item.productoId,
          (cantidadesProducto.get(item.productoId) || 0) + item.cantidad
        );
        nombrePorId.set(item.productoId, item.productoNombre);
      }
    }

    const varianteIds = [...cantidadesVariante.keys()].sort();
    const productoIds = [...cantidadesProducto.keys()].sort();

    const variantes = varianteIds.length
      ? await tx.$queryRaw`
          SELECT pv.id, pv.stock, pv.activo
          FROM producto_variantes pv
          JOIN productos p ON p.id = pv.producto_id
          WHERE pv.id = ANY(${varianteIds}::uuid[])
            AND p.tienda_id = ${tiendaId}::uuid
          ORDER BY pv.id
          FOR UPDATE OF pv
        `
      : [];

    const productos = productoIds.length
      ? await tx.$queryRaw`
          SELECT id, stock, activo, es_servicio AS "esServicio"
          FROM productos
          WHERE id = ANY(${productoIds}::uuid[])
            AND tienda_id = ${tiendaId}::uuid
          ORDER BY id
          FOR UPDATE
        `
      : [];

    const variantesPorId = new Map(variantes.map(v => [v.id, v]));
    for (const [id, cantidad] of cantidadesVariante) {
      const variante = variantesPorId.get(id);
      if (!variante || !variante.activo) {
        throw new ValidationError(`Variante "${nombrePorId.get(id)}" no disponible`);
      }
      if (variante.stock < cantidad) {
        throw new ValidationError(
          `Stock insuficiente para "${nombrePorId.get(id)}". Disponible: ${variante.stock}, solicitado: ${cantidad}`
        );
      }
    }

    const productosPorId = new Map(productos.map(p => [p.id, p]));
    for (const [id, cantidad] of cantidadesProducto) {
      const producto = productosPorId.get(id);
      if (!producto || !producto.activo) {
        throw new ValidationError(`Producto "${nombrePorId.get(id)}" no disponible`);
      }
      // Los servicios no tienen stock físico
      if (!producto.esServicio && producto.stock < cantidad) {
        throw new ValidationError(
          `Stock insuficiente para "${nombrePorId.get(id)}". Disponible: ${producto.stock}, solicitado: ${cantidad}`
        );
      }
    }

    return {
      variantesADescontar: [...cantidadesVariante].map(([id, cantidad]) => ({ id, cantidad })),
      productosADescontar: [...cantidadesProducto]
        .filter(([id]) => !productosPorId.get(id).esServicio)
        .map(([id, cantidad]) => ({ id, cantidad }))
    };
  }

  /**
   * Descuenta stock en 2 queries fijas (una por tabla) vía UPDATE ... FROM unnest.
   * El guard "stock >= cantidad" es defensa en profundidad: con los locks
   * FOR UPDATE ya tomados en #validarYBloquearStock nunca debería fallar,
   * pero si fallara el conteo de filas afectadas no cuadra y se hace rollback
   * en vez de dejar stock negativo.
   */
  async #descontarStock(variantesADescontar, productosADescontar, tx) {
    if (variantesADescontar.length > 0) {
      const ids = variantesADescontar.map(v => v.id);
      const cantidades = variantesADescontar.map(v => v.cantidad);
      const afectadas = await tx.$executeRaw`
        UPDATE producto_variantes pv
        SET stock = pv.stock - d.cantidad
        FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
        WHERE pv.id = d.id AND pv.stock >= d.cantidad
      `;
      if (afectadas !== variantesADescontar.length) {
        throw new ValidationError("El stock cambió mientras se procesaba el pedido. Intenta nuevamente.");
      }
    }

    if (productosADescontar.length > 0) {
      const ids = productosADescontar.map(p => p.id);
      const cantidades = productosADescontar.map(p => p.cantidad);
      const afectados = await tx.$executeRaw`
        UPDATE productos p
        SET stock = p.stock - d.cantidad
        FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
        WHERE p.id = d.id AND p.stock >= d.cantidad
      `;
      if (afectados !== productosADescontar.length) {
        throw new ValidationError("El stock cambió mientras se procesaba el pedido. Intenta nuevamente.");
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
      // 1. Validar stock y bloquear las filas involucradas (FOR UPDATE).
      //    2 queries fijas sin importar el número de items del carrito.
      const { variantesADescontar, productosADescontar } =
        await this.#validarYBloquearStock(tiendaId, detalles, tx);

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
      await this.#descontarStock(variantesADescontar, productosADescontar, tx);

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

        // Agrupar cantidades por variante/producto para reponer en batch
        // (2 queries fijas, igual que el descuento en create)
        const reponerVariantes = new Map();
        const reponerProductos = new Map();
        for (const item of detalles) {
          if (!item.productoId) continue;
          if (item.varianteId) {
            reponerVariantes.set(
              item.varianteId,
              (reponerVariantes.get(item.varianteId) || 0) + item.cantidad
            );
          } else {
            reponerProductos.set(
              item.productoId,
              (reponerProductos.get(item.productoId) || 0) + item.cantidad
            );
          }
        }

        if (reponerVariantes.size > 0) {
          const ids = [...reponerVariantes.keys()];
          const cantidades = [...reponerVariantes.values()];
          await tx.$executeRaw`
            UPDATE producto_variantes pv
            SET stock = pv.stock + d.cantidad
            FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
            WHERE pv.id = d.id
          `;
        }

        if (reponerProductos.size > 0) {
          const ids = [...reponerProductos.keys()];
          const cantidades = [...reponerProductos.values()];
          // Los servicios no manejan stock físico: no se les descuenta al crear
          // ni se les repone al cancelar
          await tx.$executeRaw`
            UPDATE productos p
            SET stock = p.stock + d.cantidad
            FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${cantidades}::int[]) AS cantidad) d
            WHERE p.id = d.id AND p.es_servicio = false
          `;
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

    const deleted = await prisma.pedidos.delete({ where: { id } });
    if (pedido.estado === "pendiente") {
      invalidatePendientesCount(pedido.tiendaId);
    }
    return deleted;
  }
}

export default PedidosService;
