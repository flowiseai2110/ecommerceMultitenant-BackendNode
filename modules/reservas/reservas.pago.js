import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { ConflictError, ValidationError } from "../../utils/errors.js";
import PasarelaService from "../pagos/pasarela/pasarela.service.js";
import { registrarDestino } from "../pagos/pasarela/destinos.js";
import { exigirAutomatico } from "../pagos/modo-pago.service.js";
import { transicionar } from "./estados.js";
import { moverVendidos } from "./eventos/eventos.service.js";
import { confirmadaEmail } from "./reservas.emails.js";
import { aplicarAccion, correoCliente, efectivoDe, obtenerSeguimiento, pedidoDeReserva } from "./reservas.service.js";
import { destinoCuota } from "./locales/cuotas.service.js";

/**
 * Pago automático de reservas (docs/specs/pago-automatico R3): el cliente paga
 * con la pasarela desde el seguimiento y la reserva se confirma sin revisión.
 * Hotel, tours, canchas y eventos pagan `montoAPagar`; locales, cuota a cuota.
 */

const pasarela = new PasarelaService();
const redondear = (n) => Math.round(n * 100) / 100;

/** Estados en que la pasarela puede confirmar (aceptada; por_pagar en eventos). */
const ESPERAN_PAGO = ["aceptada", "por_pagar"];

/**
 * Destino de pasarela de una reserva de un solo pago.
 * @param {{ validar?: boolean, ahora?: Date }} [opciones] - validar=false en el webhook: el cargo ya se hizo
 * @returns {Promise<import("../pagos/pasarela/destinos.js").DestinoPago>}
 */
export async function destinoReserva(tiendaId, pedidoId, { validar = true, ahora = new Date() } = {}) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (validar) transicionar(efectivoDe(pedido, ahora), "pago_pasarela", pedido.tipo);
  return {
    tiendaId,
    pedidoId,
    cuotaId: null,
    monto: Number(pedido.reserva.montoAPagar),
    email: pedido.clienteEmail,
    descripcion: `Reserva ${pedido.numeroPedido}`,
    alPagar: (datos) => confirmarReservaPasarela(tiendaId, pedidoId, datos)
  };
}

/**
 * La pasarela confirmó el pago (R3.4): lo mismo que "verificar" a mano, sin
 * revisión. Si la reserva cambió mientras el cliente pagaba (venció o se
 * canceló), el pago queda registrado y anotado para que el negocio lo devuelva.
 */
async function confirmarReservaPasarela(tiendaId, pedidoId, { pago, metodo, cargoId }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const estado = efectivoDe(pedido, ahora);
  const monto = Number(pago.monto);
  const nota = `Pago en línea · S/ ${monto.toFixed(2)} · ${metodo}`;

  if (!ESPERAN_PAGO.includes(estado)) {
    if (estado === "confirmada") return;
    await prisma.pedido_historial_estados.create({
      data: { pedidoId, estado: pedido.estado, notas: `${nota} · la reserva estaba ${estado}: revisar devolución` }
    });
    logger.warn(`Reservas: pago en línea ${cargoId} con la reserva ${pedido.numeroPedido} ${estado}: revisar devolución`);
    return;
  }

  const pagado = redondear(Number(pedido.montoPagado) + monto);
  await prisma.$transaction(async (tx) => {
    // Entradas: el cupo apartado pasa a vendido (filas bloqueadas; el CHECK impide sobrevender).
    if (pedido.tipo === "evento") await moverVendidos(tx, tiendaId, pedidoId, +1);
    await aplicarAccion(tx, pedido, "pago_pasarela", {
      ahora,
      datosPedido: {
        montoPagado: pagado,
        estadoPago: pagado >= Number(pedido.total) ? "pagado" : "parcial",
        fechaConfirmado: ahora,
        metodoPago: metodo,
        referenciaPago: cargoId
      },
      nota
    });
  });
  await correoCliente(tiendaId, pedidoId, confirmadaEmail);
}

/**
 * Saldo de una reserva ya confirmada (plantillas-por-rubro E8: "pagar el saldo
 * antes de llegar"). Cobra lo que falta del total y lo descuenta del saldo en destino.
 */
export async function destinoSaldo(tiendaId, pedidoId, { validar = true, ahora = new Date() } = {}) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const saldo = redondear(Number(pedido.total) - Number(pedido.montoPagado));
  if (validar && efectivoDe(pedido, ahora) !== "confirmada") {
    const message = "Esta reserva ya no admite pagos";
    throw new ConflictError(message, { message, motivo: "RESERVA_NO_ACTIVA" });
  }
  return {
    tiendaId, pedidoId, cuotaId: null,
    // Queda en pagos.metadata: el webhook sabe que este pago es del saldo.
    concepto: "saldo",
    monto: saldo,
    email: pedido.clienteEmail,
    descripcion: `Reserva ${pedido.numeroPedido} · saldo`,
    alPagar: (datos) => registrarSaldo(tiendaId, pedidoId, datos)
  };
}

async function registrarSaldo(tiendaId, pedidoId, { pago, metodo, cargoId }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const monto = Number(pago.monto);
  const pagado = redondear(Number(pedido.montoPagado) + monto);
  await prisma.$transaction(async (tx) => {
    await tx.pedidos.update({
      where: { id: pedidoId },
      data: { montoPagado: pagado, estadoPago: pagado >= Number(pedido.total) ? "pagado" : "parcial", referenciaPago: cargoId, fechaActualizacion: ahora }
    });
    await tx.reservas.update({
      where: { pedidoId },
      data: { saldoDestino: Math.max(0, redondear(Number(pedido.reserva.saldoDestino) - monto)) }
    });
    await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: `Saldo pagado en línea · S/ ${monto.toFixed(2)} · ${metodo}` } });
  });
}

/**
 * Store (R3.1): cobra la reserva (o una cuota de un local) con la pasarela de
 * la plataforma. Devuelve el pago y el seguimiento actualizado. Un rechazo
 * responde 422 y la reserva sigue esperando el pago (R3.5).
 */
export async function pagarReserva(tiendaId, pedidoId, { tokenId, metodo, cuotaId = null, email = null }, ahora = new Date()) {
  const { proveedor } = await exigirAutomatico(tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  let destino;
  if (pedido.tipo === "local") {
    if (!cuotaId) {
      const message = "Elige la cuota que vas a pagar";
      throw new ValidationError(message, { message, body: { cuotaId: [message] } });
    }
    destino = await destinoCuota(tiendaId, pedidoId, cuotaId, { ahora });
  } else if (efectivoDe(pedido, ahora) === "confirmada") {
    destino = await destinoSaldo(tiendaId, pedidoId, { ahora });
  } else {
    destino = await destinoReserva(tiendaId, pedidoId, { ahora });
  }
  const pago = await pasarela.cobrar({ destino, tokenId, metodo, proveedor, email });
  return { pago, reserva: await obtenerSeguimiento(tiendaId, pedidoId) };
}

// Webhook (R5.1): un pago de una reserva vuelve a su destino (cuota o reserva).
registrarDestino(async (pago) => {
  if (pago.parteId) return null;
  const reserva = await prisma.reservas.findUnique({ where: { pedidoId: pago.pedidoId }, select: { pedidoId: true } });
  if (!reserva) return null;
  if (pago.cuotaId) return destinoCuota(pago.tiendaId, pago.pedidoId, pago.cuotaId, { validar: false });
  return pago.metadata?.concepto === "saldo"
    ? destinoSaldo(pago.tiendaId, pago.pedidoId, { validar: false })
    : destinoReserva(pago.tiendaId, pago.pedidoId, { validar: false });
});
