import { prisma, Prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { invalidatePendientesCount } from "./pedidos-pendientes-cache.js";
import { crearPedido, cotizarPedido } from "./crear-pedido.js";
import emailService from "../../services/email.service.js";
import { logger } from "../../config/logger.js";
import { reponerStock } from "../inventario/inventario.service.js";
import { nivelDeAcceso, serializarRastreo } from "./rastreo.js";

// Columnas del destino de entrega en `pedidos` (ver schema.prisma).
export const CAMPOS_DESTINO = [
  "courier", "agenciaTexto", "departamento", "provincia", "distrito",
  "ubigeoCode", "referencia", "latitud", "longitud"
];

// Campos que el admin puede corregir con updateDetalles.
const CAMPOS_DETALLES = [
  "metodoEnvio", "direccionEnvio", "comprobante", "notas",
  "comprobanteDocTipo", "comprobanteDocNumero", "razonSocial", "direccionFiscal"
];

const PAGO_LABELS = {
  pagado: "Pago confirmado",
  pendiente: "Pago marcado como pendiente",
  rechazado: "Pago rechazado",
  reembolsado: "Pago reembolsado"
};

// Texto del historial para un cambio de estado de pago (ej. "Pago confirmado · Yape · Op. 0458").
function notaPago(estadoPago, metodoPago, referenciaPago) {
  const partes = [PAGO_LABELS[estadoPago] ?? `Pago: ${estadoPago}`];
  if (estadoPago === "pagado") {
    if (metodoPago) partes.push(metodoPago);
    if (referenciaPago) partes.push(`Op. ${referenciaPago}`);
  }
  return partes.join(" · ");
}

/**
 * Servicio de Pedidos (contexto Órdenes) con lógica de negocio completa:
 * - Generación de número de pedido sin race condition (advisory lock)
 * - Validación/bloqueo/descuento de stock (delegado al contexto Inventario)
 * - Upsert de cliente por WhatsApp
 * - Actualización de estadísticas del cliente
 * - Reposición de stock y reversión de estadísticas al cancelar
 */
/**
 * Genera el siguiente número de pedido para una tienda. Lo comparten los
 * pedidos del ecommerce y las reservas (mini booking): una sola numeración.
 * Usa pg_advisory_xact_lock para evitar race conditions bajo concurrencia.
 * Usa MAX sobre el campo parseado para ser robusto ante eliminaciones.
 */
export async function generarNumeroPedido(tiendaId, tx) {
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
export async function upsertCliente(tiendaId, clienteData, tx) {
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

class PedidosService {
  /**
   * Crea un pedido de compra: el caso de uso vive en crear-pedido.js
   * (docs/specs/precio-en-servidor; precios calculados en el servidor).
   */
  async create(data, opciones) {
    return crearPedido(data, opciones);
  }

  /** Cotiza el carrito sin escribir nada, con la misma regla que crear (crear-pedido.js). */
  async cotizar(data) {
    return cotizarPedido(data);
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
            direccionPredeterminada: true,
            totalPedidos: true
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

    // Pedido completo (con historial) para que el admin refresque la línea de tiempo.
    return this.findById(updated.id, tiendaId);
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

    await prisma.$transaction(async (tx) => {
      await tx.pedidos.update({ where: { id }, data: updateData });

      // Un cambio de estado de pago queda en la línea de tiempo del pedido
      // (el estado logístico no cambia: se registra con el actual).
      if (estadoPago !== pedido.estadoPago) {
        await tx.pedido_historial_estados.create({
          data: {
            pedidoId: id,
            estado: pedido.estado,
            notas: notaPago(estadoPago, updateData.metodoPago ?? pedido.metodoPago, updateData.referenciaPago ?? pedido.referenciaPago)
          }
        });
      }
    });

    return this.findById(id, tiendaId);
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

    for (const campo of CAMPOS_DETALLES) {
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
   * Seguimiento público de un pedido por su número, scopeado a la tienda, en
   * dos niveles (ver rastreo.js): sin prueba de identidad solo estado y fechas;
   * el detalle completo exige ser el dueño con sesión o los últimos 4 dígitos
   * del WhatsApp del pedido.
   * @param {string} tiendaId - Tienda dueña del pedido (scope multi-tenant).
   * @param {string} numeroPedido - Número visible del pedido (ej. "PED-0001").
   * @param {{ verificacion?: string, authUserId?: string|null }} [solicitante]
   * @returns {Promise<object>} Pedido recortado según el nivel de acceso.
   * @throws {NotFoundError} si no existe un pedido con ese número en la tienda.
   * @throws {AppError} 403 VERIFICACION_INVALIDA si los dígitos no coinciden.
   */
  async rastrear(tiendaId, numeroPedido, solicitante = {}) {
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
          select: { id: true, estado: true, notas: true, fechaRegistro: true },
          orderBy: { fechaRegistro: "asc" }
        },
        // Solo para decidir el nivel; serializarRastreo nunca los devuelve.
        clienteWhatsapp: true,
        authUserId: true
      }
    });

    if (!pedido) throw new NotFoundError("Pedido");
    return serializarRastreo(pedido, nivelDeAcceso(pedido, solicitante));
  }

  /**
   * "Mis pedidos" del comprador logueado en una tienda. Solo los pedidos que
   * hizo con sesión iniciada (authUserId); los de invitado no se le asocian
   * porque el WhatsApp no prueba que sea la misma persona.
   * @param {string} tiendaId
   * @param {string} authUserId - `sub` del JWT de Supabase.
   * @returns {Promise<object[]>}
   */
  async listByAuthUser(tiendaId, authUserId) {
    const pedidos = await prisma.pedidos.findMany({
      // Solo compras: las reservas tienen su lista con link de seguimiento (/cuenta/reservas).
      where: { tiendaId, authUserId, reserva: { is: null } },
      orderBy: { fechaRegistro: "desc" },
      take: 50,
      select: {
        id: true,
        numeroPedido: true,
        estado: true,
        estadoPago: true,
        total: true,
        metodoPago: true,
        metodoEnvio: true,
        fechaRegistro: true,
        _count: { select: { detalles: true } }
      }
    });

    return pedidos.map(({ _count, total, ...pedido }) => ({
      ...pedido,
      total: Number(total),
      cantidadItems: _count.detalles
    }));
  }

  /**
   * Datos de contacto del último pedido del comprador en esta tienda, para
   * autocompletar el checkout. Se toma del snapshot del pedido (lo que el
   * propio comprador escribió), no de la ficha `clientes`, que la edita el admin.
   *
   * Incluye el destino de entrega y el nombre del método de envío: el checkout
   * los precarga si ese método sigue activo en la tienda.
   * @param {string} tiendaId
   * @param {string} authUserId
   * @returns {Promise<object|null>}
   */
  async ultimoContacto(tiendaId, authUserId) {
    const destinoSelect = Object.fromEntries(CAMPOS_DESTINO.map(c => [c, true]));
    const pedido = await prisma.pedidos.findFirst({
      where: { tiendaId, authUserId },
      orderBy: { fechaRegistro: "desc" },
      select: {
        clienteNombre: true,
        clienteWhatsapp: true,
        clienteEmail: true,
        metodoEnvio: true,
        direccionEnvio: true,
        ...destinoSelect,
        cliente: { select: { tipoDocumento: true, numeroDocumento: true } }
      }
    });
    if (!pedido) return null;

    const destino = { direccion: pedido.direccionEnvio };
    for (const campo of CAMPOS_DESTINO) destino[campo] = pedido[campo];

    return {
      nombre: pedido.clienteNombre,
      whatsappNumero: pedido.clienteWhatsapp,
      email: pedido.clienteEmail,
      tipoDocumento: pedido.cliente?.tipoDocumento ?? null,
      numeroDocumento: pedido.cliente?.numeroDocumento ?? null,
      metodoEnvio: pedido.metodoEnvio,
      destino
    };
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
