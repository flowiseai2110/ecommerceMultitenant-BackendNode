import { prisma, Prisma } from "../../../config/prisma.js";
import { NotFoundError, ValidationError, UnprocessableError, ConflictError } from "../../../utils/errors.js";
import { logger } from "../../../config/logger.js";
import { getProvider } from "./provider-factory.js";
import { EstadoPago } from "./payment-provider.js";
import PasarelaConfigService from "./pasarela-config.service.js";

const configService = new PasarelaConfigService();

/**
 * Servicio de pagos con pasarela (PSP). Orquesta: credenciales por tienda +
 * proveedor + persistencia del pago + actualización del pedido.
 *
 * Reglas de seguridad clave (ver pasarela-de-pagos/):
 * - El monto SIEMPRE sale del pedido en el servidor, nunca del cliente.
 * - El estado de verdad se confirma contra el proveedor (createCharge y, en el
 *   webhook, getChargeStatus). El frontend no puede marcar un pedido como pagado.
 * - Los webhooks se procesan con idempotencia (unique en pago_eventos).
 */
class PasarelaService {
  /**
   * Crea un cargo para un pedido usando un token generado en el frontend.
   * @param {object} params
   * @param {string} params.tiendaId
   * @param {string} params.pedidoId
   * @param {string} params.tokenId - Token de Culqi (tkn_) generado por Culqi.js.
   * @param {string} params.metodo - "tarjeta" | "yape".
   * @param {string} [params.proveedor="culqi"]
   * @param {string} [params.email] - Email del comprador (fallback al del pedido).
   * @param {object} [params.antifraud]
   * @returns {Promise<object>} pago (forma pública)
   */
  async crearCargo({ tiendaId, pedidoId, tokenId, metodo, proveedor = "culqi", email, antifraud }) {
    // 1. Cargar el pedido y validar pertenencia a la tienda + estado de pago.
    const pedido = await prisma.pedidos.findUnique({
      where: { id: pedidoId },
      select: {
        id: true, tiendaId: true, numeroPedido: true, total: true,
        estadoPago: true, clienteEmail: true, clienteNombre: true
      }
    });

    if (!pedido || pedido.tiendaId !== tiendaId) {
      throw new NotFoundError("Pedido");
    }
    if (pedido.estadoPago === EstadoPago.PAGADO) {
      throw new ConflictError("El pedido ya fue pagado");
    }

    const emailComprador = email || pedido.clienteEmail;
    if (!emailComprador) {
      throw new ValidationError("Se requiere un email para procesar el pago");
    }

    // 2. Credenciales de la tienda (descifradas) + proveedor.
    const credentials = await configService.getCredentials(tiendaId, proveedor);
    const provider = getProvider(proveedor);

    // 3. Registrar el intento de pago en estado pendiente. El monto viene del
    //    pedido (servidor), no del cliente.
    const monto = Number(pedido.total);
    const pago = await prisma.pagos.create({
      data: {
        tiendaId,
        pedidoId,
        proveedor,
        metodo,
        monto: pedido.total,
        moneda: "PEN",
        estado: EstadoPago.PENDIENTE,
        fechaRegistro: new Date(),
        usuarioRegistro: "storefront"
      }
    });

    // 4. Ejecutar el cargo contra el proveedor.
    let resultado;
    try {
      resultado = await provider.createCharge({
        credentials,
        tokenId,
        amount: monto,
        currency: "PEN",
        email: emailComprador,
        description: `Pedido ${pedido.numeroPedido}`,
        antifraud,
        metadata: { tiendaId, pedidoId, pagoId: pago.id }
      });
    } catch (error) {
      // El cargo falló: dejar el pago en "fallido" con el motivo y traducir a un
      // error 422 legible para el cliente (sin filtrar detalles internos).
      await prisma.pagos.update({
        where: { id: pago.id },
        data: {
          estado: EstadoPago.FALLIDO,
          outcomeCode: error.code ?? null,
          outcomeMensaje: error.message ?? "Error al procesar el pago",
          fechaActualizacion: new Date()
        }
      });
      logger.warn(`Cargo fallido pedido ${pedido.numeroPedido} (${proveedor}): ${error.message}`);
      throw new UnprocessableError(error.userMessage || error.message || "No se pudo procesar el pago");
    }

    // 5. Persistir el resultado del cargo y sincronizar el pedido si quedó pagado.
    return this.#aplicarResultado(pago.id, pedido, metodo, resultado);
  }

  /**
   * Procesa un webhook del proveedor. Idempotente: un evento reenviado no se
   * reprocesa. Reconfirma el estado contra el proveedor antes de tocar el pedido.
   * @param {object} params
   * @param {string} params.proveedor
   * @param {object} params.body - Cuerpo del webhook ya parseado.
   * @returns {Promise<{procesado: boolean, duplicado?: boolean, motivo?: string}>}
   */
  async procesarWebhook({ proveedor, body }) {
    const provider = getProvider(proveedor);
    const { proveedorEventoId, tipo, chargeId } = provider.parseWebhook(body);

    // 1. Idempotencia: registrar el evento. Si el unique choca, ya se recibió.
    try {
      await prisma.pago_eventos.create({
        data: { proveedor, proveedorEventoId, tipo, payload: body, procesado: false }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        logger.info(`Webhook duplicado ignorado (${proveedor} ${proveedorEventoId})`);
        return { procesado: false, duplicado: true };
      }
      throw error;
    }

    // 2. Ubicar el pago por el id del cargo.
    if (!chargeId) {
      return this.#marcarEvento(proveedor, proveedorEventoId, null, "sin_charge_id");
    }
    const pago = await prisma.pagos.findFirst({
      where: { proveedor, proveedorCargoId: chargeId }
    });
    if (!pago) {
      logger.warn(`Webhook para cargo desconocido (${proveedor} ${chargeId})`);
      return this.#marcarEvento(proveedor, proveedorEventoId, null, "pago_no_encontrado");
    }

    // 3. Reconfirmar el estado real contra el proveedor (fuente de verdad).
    const credentials = await configService.getCredentials(pago.tiendaId, proveedor);
    const estadoReal = await provider.getChargeStatus({ credentials, chargeId });

    // 4. Actualizar pago + pedido y marcar el evento como procesado.
    const pedido = await prisma.pedidos.findUnique({
      where: { id: pago.pedidoId },
      select: { id: true, tiendaId: true, numeroPedido: true, estadoPago: true }
    });

    await this.#sincronizar(pago, pedido, pago.metodo, {
      proveedorCargoId: chargeId,
      estado: estadoReal.estado,
      outcomeCode: estadoReal.outcomeCode,
      outcomeMensaje: estadoReal.outcomeMensaje
    });

    return this.#marcarEvento(proveedor, proveedorEventoId, pago.id, "ok");
  }

  /**
   * Aplica el resultado de un createCharge: actualiza el pago con el id del cargo
   * y su estado, y sincroniza el pedido. Devuelve el pago en forma pública.
   */
  async #aplicarResultado(pagoId, pedido, metodo, resultado) {
    const pago = await prisma.pagos.findUnique({ where: { id: pagoId } });
    await this.#sincronizar(pago, pedido, metodo, resultado);
    const actualizado = await prisma.pagos.findUnique({ where: { id: pagoId } });
    return this.#toPublic(actualizado);
  }

  /**
   * Actualiza el pago y, si quedó pagado, marca el pedido como pagado. Nunca
   * "despaga" un pedido ya pagado (solo avanza a pagado).
   */
  async #sincronizar(pago, pedido, metodo, resultado) {
    await prisma.pagos.update({
      where: { id: pago.id },
      data: {
        proveedorCargoId: resultado.proveedorCargoId ?? pago.proveedorCargoId,
        estado: resultado.estado,
        outcomeCode: resultado.outcomeCode ?? null,
        outcomeMensaje: resultado.outcomeMensaje ?? null,
        fechaActualizacion: new Date()
      }
    });

    if (resultado.estado === EstadoPago.PAGADO && pedido && pedido.estadoPago !== EstadoPago.PAGADO) {
      await prisma.pedidos.update({
        where: { id: pedido.id },
        data: {
          estadoPago: EstadoPago.PAGADO,
          metodoPago: metodo,
          referenciaPago: resultado.proveedorCargoId ?? null,
          fechaActualizacion: new Date()
        }
      });
      logger.info(`Pedido ${pedido.numeroPedido} marcado como pagado (${resultado.proveedorCargoId})`);
    }
  }

  /** Marca un evento como procesado y lo enlaza al pago. */
  async #marcarEvento(proveedor, proveedorEventoId, pagoId, motivo) {
    await prisma.pago_eventos.update({
      where: { uq_evento_proveedor: { proveedor, proveedorEventoId } },
      data: { procesado: true, pagoId }
    });
    return { procesado: true, motivo };
  }

  /** Proyección pública de un pago (sin metadata cruda del proveedor). */
  #toPublic(pago) {
    return {
      id: pago.id,
      pedidoId: pago.pedidoId,
      proveedor: pago.proveedor,
      proveedorCargoId: pago.proveedorCargoId,
      metodo: pago.metodo,
      monto: Number(pago.monto),
      moneda: pago.moneda,
      estado: pago.estado,
      outcomeMensaje: pago.outcomeMensaje,
      fechaRegistro: pago.fechaRegistro
    };
  }
}

export default PasarelaService;
