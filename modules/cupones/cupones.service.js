import { prisma } from "../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { PORCENTAJE_MAXIMO } from "./cupones.schema.js";
import { TRADUCTOR_BASE } from "../idiomas/traductor.js";
import { aCentimos, aSoles } from "../precios/precio-vigente.js";
import { CUPON_CAMPANA_NO_VIGENTE, evaluarCupon } from "./regla-cupon.js";
import { cuponDeCampanaVigente } from "../campanas/promocion.js";
import { conCampana, nombreCampanaDelCupon } from "../campanas/cupon-campana.service.js";
import { contextoDePrecios } from "../precios/contexto.service.js";

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
    // El cupón de una campaña dice de cuál es (campanas-descuento A8).
    data: await conCampana(prisma, tiendaId, data),
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
  // El schema solo ve lo que llega: aquí se cruza con lo guardado (solo cambia el valor, o solo el tipo).
  const tipo = data.tipo ?? cupon.tipo;
  const valor = Number(data.valor ?? cupon.valor);
  if (tipo === "porcentaje" && valor > PORCENTAJE_MAXIMO) {
    throw new ValidationError("Errores de validación", { body: { valor: [`El porcentaje no puede pasar de ${PORCENTAJE_MAXIMO}`] } });
  }
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
  const cupon = await prisma.cupones.findFirst({
    where: { tiendaId, codigo: codigo.toUpperCase() }
  });

  // Usos del cliente solo si se envía el WhatsApp y el cupón tiene límite.
  let usosCliente = null;
  if (cupon && whatsappNumero && cupon.usoMaximoPorCliente !== null) {
    const cliente = await prisma.clientes.findFirst({
      where: { tiendaId, whatsappNumero },
      select: { id: true }
    });
    if (cliente) {
      usosCliente = await prisma.pedidos.count({
        where: { tiendaId, clienteId: cliente.id, codigoCupon: cupon.codigo }
      });
    }
  }

  // El cupón de una campaña vence con ella (R4.8, CA-4.7): lectura fresca, sin la caché de la vitrina.
  if (cupon?.campanaPromocionId) {
    const { promociones } = await contextoDePrecios(prisma, tiendaId, { conCache: false });
    if (!cuponDeCampanaVigente(cupon, promociones)) {
      const nombre = await nombreCampanaDelCupon(prisma, tiendaId, cupon.campanaPromocionId);
      return { valido: false, mensaje: TRADUCTOR_BASE(CUPON_CAMPANA_NO_VIGENTE, { nombre }) };
    }
  }

  // La misma regla con la que se cobra el pedido (regla-cupon.js), en céntimos. Aquí no
  // se conocen las líneas: si el cupón se mide solo sobre las que no tienen promoción
  // (R7.3), lo decide la cotización del checkout, que lo rechaza o lo ajusta.
  const r = evaluarCupon(cupon, { subtotal: aCentimos(subtotal), ahora: new Date(), usosCliente });
  if (!r.valido) return { valido: false, mensaje: TRADUCTOR_BASE(r.clave, r.params) };
  const descuento = aSoles(r.descuento);

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
