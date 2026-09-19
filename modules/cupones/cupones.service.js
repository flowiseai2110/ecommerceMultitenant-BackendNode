import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";

/**
 * Servicio de Cupones (promociones). CRUD admin scopeado por tienda y validación
 * pública de un código en el checkout.
 */

/**
 * Lista los cupones de una tienda con paginación.
 * @param {string} tiendaId
 * @param {{ page?: number|string, limit?: number|string, activo?: string }} query
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function listCupones(tiendaId, { page = 1, limit = 20, activo } = {}) {
  const take = Math.min(parseInt(limit) || 20, 100);
  const skip = ((parseInt(page) || 1) - 1) * take;

  const where = { tiendaId };
  if (activo !== undefined) where.activo = activo === "true";

  const [data, total] = await Promise.all([
    prisma.cupones.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.cupones.count({ where })
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
 * Obtiene un cupón por ID validando pertenencia a la tienda.
 * @param {string} tiendaId
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function getCupon(tiendaId, id) {
  const cupon = await prisma.cupones.findUnique({ where: { id } });
  if (!cupon || cupon.tiendaId !== tiendaId) throw new NotFoundError("Cupón");
  return cupon;
}

/**
 * Crea un cupón. El body ya viene validado y scopeado a la tienda.
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createCupon(data) {
  return prisma.cupones.create({ data });
}

/**
 * Actualiza un cupón validando pertenencia a la tienda.
 * @param {string} tiendaId
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function updateCupon(tiendaId, id, data) {
  const cupon = await prisma.cupones.findUnique({ where: { id } });
  if (!cupon || cupon.tiendaId !== tiendaId) throw new NotFoundError("Cupón");
  return prisma.cupones.update({ where: { id }, data });
}

/**
 * Elimina un cupón validando pertenencia a la tienda.
 * @param {string} tiendaId
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {NotFoundError}
 */
export async function deleteCupon(tiendaId, id) {
  const cupon = await prisma.cupones.findUnique({ where: { id } });
  if (!cupon || cupon.tiendaId !== tiendaId) throw new NotFoundError("Cupón");
  await prisma.cupones.delete({ where: { id } });
}

/**
 * Valida un código de cupón en el contexto de un checkout (público). No lanza:
 * devuelve siempre un objeto resultado con `valido` (true/false) y el detalle.
 * @param {string} tiendaId
 * @param {string} codigo - Código del cupón (case-insensitive).
 * @param {number} subtotal - Subtotal del carrito.
 * @param {string} [whatsappNumero] - Para validar el límite por cliente.
 * @returns {Promise<object>} { valido, mensaje, cupon?, descuento? }
 */
export async function validarCupon(tiendaId, codigo, subtotal, whatsappNumero) {
  const now = new Date();

  const cupon = await prisma.cupones.findFirst({
    where: { tiendaId, codigo: codigo.toUpperCase() }
  });

  const invalido = (mensaje) => ({ valido: false, mensaje });

  if (!cupon) return invalido("Cupón no válido");
  if (!cupon.activo) return invalido("Cupón inactivo");
  if (cupon.fechaInicio && cupon.fechaInicio > now) return invalido("Cupón aún no vigente");
  if (cupon.fechaFin && cupon.fechaFin < now) return invalido("Cupón expirado");
  if (cupon.usoMaximo !== null && cupon.usoActual >= cupon.usoMaximo)
    return invalido("Cupón agotado");
  if (Number(cupon.minimoCompra) > 0 && subtotal < Number(cupon.minimoCompra))
    return invalido(`Compra mínima requerida: ${cupon.minimoCompra}`);

  // Verificar límite por cliente si se envía el WhatsApp y el cupón tiene límite
  if (whatsappNumero && cupon.usoMaximoPorCliente !== null) {
    const cliente = await prisma.clientes.findFirst({
      where: { tiendaId, whatsappNumero },
      select: { id: true }
    });
    if (cliente) {
      const usosCliente = await prisma.pedidos.count({
        where: { tiendaId, clienteId: cliente.id, codigoCupon: cupon.codigo }
      });
      if (usosCliente >= cupon.usoMaximoPorCliente) {
        return invalido("Ya usaste este cupón el máximo de veces permitido");
      }
    }
  }

  const descuento =
    cupon.tipo === "porcentaje"
      ? Math.round(subtotal * (Number(cupon.valor) / 100) * 100) / 100
      : Math.min(Number(cupon.valor), subtotal);

  return {
    valido: true,
    cupon: {
      id: cupon.id,
      codigo: cupon.codigo,
      tipo: cupon.tipo,
      valor: Number(cupon.valor),
      minimoCompra: Number(cupon.minimoCompra),
      usoMaximoPorCliente: cupon.usoMaximoPorCliente
    },
    descuento,
    mensaje: null
  };
}
