import { prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../../utils/errors.js";
import { logger } from "../../../config/logger.js";
import { EstadoPago } from "./payment-provider.js";

/**
 * Destino de un pago (Strategy, docs/specs/pago-automatico "Diseño"): qué se
 * cobra y qué pasa cuando la pasarela confirma. PasarelaService solo habla con
 * esta forma y no sabe si cobra un pedido, una reserva o una cuota.
 *
 * @typedef {object} DestinoPago
 * @property {string} tiendaId
 * @property {string} pedidoId
 * @property {string|null} cuotaId
 * @property {string|null} [parteId] - parte de un pago dividido (canchas)
 * @property {string} [concepto] - se guarda en pagos.metadata ("saldo") para el webhook
 * @property {number} monto - en soles, calculado en el servidor
 * @property {string|null} email
 * @property {string} descripcion
 * @property {(datos: { pago: object, metodo: string, cargoId: string|null }) => Promise<void>} alPagar
 *   Idempotente: lo puede llamar la respuesta del cargo y también el webhook.
 */

const resolutores = [];

/**
 * Un módulo (reservas) registra cómo reconstruir su destino a partir de un pago
 * ya creado, para el webhook. Devuelve null si el pago no es suyo.
 * @param {(pago: object) => Promise<DestinoPago|null>} resolutor
 */
export function registrarDestino(resolutor) {
  resolutores.push(resolutor);
}

/** Destino de un pago existente (webhook). Sin dueño registrado, es un pedido de comercio. */
export async function destinoDePago(pago) {
  for (const resolver of resolutores) {
    const destino = await resolver(pago);
    if (destino) return destino;
  }
  return destinoPedido(pago.tiendaId, pago.pedidoId, { validar: false });
}

/**
 * Pedido de comercio (R4): se cobra el total y, al pagar, queda `estadoPago = pagado`.
 * @param {string} tiendaId
 * @param {string} pedidoId
 * @param {{ validar?: boolean }} [opciones] - false en el webhook: el cargo ya se hizo
 * @returns {Promise<DestinoPago>}
 */
export async function destinoPedido(tiendaId, pedidoId, { validar = true } = {}) {
  const pedido = await prisma.pedidos.findUnique({
    where: { id: pedidoId },
    select: { id: true, tiendaId: true, numeroPedido: true, total: true, estadoPago: true, clienteEmail: true }
  });
  if (!pedido || pedido.tiendaId !== tiendaId) throw new NotFoundError("Pedido");
  if (validar && pedido.estadoPago === EstadoPago.PAGADO) throw new ConflictError("El pedido ya fue pagado");

  return {
    tiendaId,
    pedidoId,
    cuotaId: null,
    monto: Number(pedido.total),
    email: pedido.clienteEmail,
    descripcion: `Pedido ${pedido.numeroPedido}`,
    async alPagar({ metodo, cargoId }) {
      // Nunca "despaga": solo avanza a pagado, y una sola vez.
      const { count } = await prisma.pedidos.updateMany({
        where: { id: pedidoId, estadoPago: { not: EstadoPago.PAGADO } },
        data: { estadoPago: EstadoPago.PAGADO, metodoPago: metodo, referenciaPago: cargoId, fechaActualizacion: new Date() }
      });
      if (count) logger.info(`Pedido ${pedido.numeroPedido} marcado como pagado (${cargoId})`);
    }
  };
}
