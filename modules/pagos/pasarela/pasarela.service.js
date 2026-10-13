import { prisma, Prisma } from "../../../config/prisma.js";
import { ValidationError, UnprocessableError, ConflictError } from "../../../utils/errors.js";
import { logger } from "../../../config/logger.js";
import { getProvider, proveedorPlataforma } from "./provider-factory.js";
import { EstadoPago } from "./payment-provider.js";
import { destinoDePago, destinoPedido } from "./destinos.js";
import PasarelaConfigService from "./pasarela-config.service.js";

const configService = new PasarelaConfigService();

/** Un cargo pendiente más reciente que esto bloquea un segundo intento (doble clic, dos pestañas). */
const VENTANA_PAGO_EN_CURSO_MS = 2 * 60 * 1000;

/**
 * Servicio de pagos con pasarela (PSP). Orquesta: credenciales por tienda +
 * proveedor + persistencia del pago + lo que pasa al pagar, que decide el
 * DESTINO del pago (pedido, reserva o cuota; ver destinos.js).
 *
 * Reglas de seguridad clave (ver pasarela-de-pagos/):
 * - El monto SIEMPRE sale del destino en el servidor, nunca del cliente.
 * - El estado de verdad se confirma contra el proveedor (createCharge y, en el
 *   webhook, getChargeStatus). El frontend no puede marcar nada como pagado.
 * - Los webhooks se procesan con idempotencia (unique en pago_eventos) y un
 *   pago solo pasa a "pagado" una vez: ahí corre `destino.alPagar`.
 */
class PasarelaService {
  /**
   * Cobra un pedido de comercio (R4). Se mantiene por compatibilidad con
   * POST /store/pagos/cargo.
   */
  async crearCargo({ tiendaId, pedidoId, tokenId, metodo, proveedor, email, antifraud }) {
    const destino = await destinoPedido(tiendaId, pedidoId);
    return this.cobrar({ destino, tokenId, metodo, proveedor: proveedor ?? proveedorPlataforma(), email, antifraud });
  }

  /**
   * Cobra un destino con un token generado en el frontend.
   * @param {object} params
   * @param {import("./destinos.js").DestinoPago} params.destino
   * @param {string} params.tokenId
   * @param {string} params.metodo - "tarjeta" | "yape"
   * @param {string} params.proveedor
   * @param {string} [params.email] - fallback al del destino
   * @param {object} [params.antifraud]
   * @returns {Promise<object>} pago (forma pública)
   */
  async cobrar({ destino, tokenId, metodo, proveedor, email, antifraud }) {
    const { tiendaId, pedidoId, cuotaId, parteId = null } = destino;
    const emailComprador = email || destino.email;
    if (!emailComprador) throw new ValidationError("Se requiere un email para procesar el pago");
    if (!(destino.monto > 0)) {
      const message = "No hay nada que pagar";
      throw new ConflictError(message, { message, motivo: "NADA_QUE_PAGAR" });
    }

    // Un cargo en curso para lo mismo: no cobrar dos veces.
    const enCurso = await prisma.pagos.findFirst({
      where: {
        pedidoId, cuotaId: cuotaId ?? null, parteId, proveedor: { not: "manual" }, estado: EstadoPago.PENDIENTE,
        fechaRegistro: { gt: new Date(Date.now() - VENTANA_PAGO_EN_CURSO_MS) }
      },
      select: { id: true }
    });
    if (enCurso) {
      const message = "Ya hay un pago en proceso. Espera unos segundos y revisa el estado.";
      throw new ConflictError(message, { message, motivo: "PAGO_EN_CURSO" });
    }

    const provider = getProvider(proveedor);
    const credentials = await this.#credenciales(tiendaId, proveedor);

    // Intento de pago pendiente. El monto viene del destino (servidor).
    const pago = await prisma.pagos.create({
      data: {
        tiendaId, pedidoId, cuotaId: cuotaId ?? null, parteId, proveedor, metodo,
        monto: destino.monto, moneda: "PEN", estado: EstadoPago.PENDIENTE,
        ...(destino.concepto ? { metadata: { concepto: destino.concepto } } : {}),
        fechaRegistro: new Date(), usuarioRegistro: "storefront"
      }
    });

    let resultado;
    try {
      resultado = await provider.createCharge({
        credentials,
        tokenId,
        amount: destino.monto,
        currency: "PEN",
        email: emailComprador,
        description: destino.descripcion,
        antifraud,
        metadata: { tiendaId, pedidoId, cuotaId: cuotaId ?? null, parteId, pagoId: pago.id }
      });
    } catch (error) {
      // El cargo falló: el pago queda "fallido" con el motivo y el cliente
      // recibe un 422 legible (sin detalles internos).
      await prisma.pagos.update({
        where: { id: pago.id },
        data: {
          estado: EstadoPago.FALLIDO,
          outcomeCode: error.code ?? null,
          outcomeMensaje: error.message ?? "Error al procesar el pago",
          fechaActualizacion: new Date()
        }
      });
      logger.warn(`Cargo fallido ${destino.descripcion} (${proveedor}): ${error.message}`);
      const message = error.userMessage || "No se pudo procesar el pago";
      throw new UnprocessableError(message, { message, motivo: "PAGO_RECHAZADO", codigo: error.code ?? null });
    }

    await this.#sincronizar(pago, destino, metodo, resultado);
    return this.#toPublic(await prisma.pagos.findUnique({ where: { id: pago.id } }));
  }

  /**
   * Procesa un webhook del proveedor. Idempotente: un evento reenviado no se
   * reprocesa. Reconfirma el estado contra el proveedor antes de tocar nada.
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
    const credentials = await this.#credenciales(pago.tiendaId, proveedor);
    const estadoReal = await provider.getChargeStatus({ credentials, chargeId });

    // 4. Aplicar al destino del pago (pedido, reserva o cuota) y marcar el evento.
    const destino = await destinoDePago(pago);
    await this.#sincronizar(pago, destino, pago.metodo, {
      proveedorCargoId: chargeId,
      estado: estadoReal.estado,
      outcomeCode: estadoReal.outcomeCode,
      outcomeMensaje: estadoReal.outcomeMensaje
    });

    return this.#marcarEvento(proveedor, proveedorEventoId, pago.id, "ok");
  }

  /** Credenciales de la tienda solo si el proveedor las pide (el simulador no). */
  async #credenciales(tiendaId, proveedor) {
    return getProvider(proveedor).requiereCredenciales
      ? configService.getCredentials(tiendaId, proveedor)
      : { proveedor };
  }

  /**
   * Guarda el resultado en el pago. Si con esto el pago PASA a pagado (y no
   * lo estaba), corre `destino.alPagar` una sola vez: la respuesta del cargo y
   * el webhook pueden llegar a la vez y solo uno gana el UPDATE condicionado.
   */
  async #sincronizar(pago, destino, metodo, resultado) {
    const cargoId = resultado.proveedorCargoId ?? pago.proveedorCargoId ?? null;
    const datos = {
      proveedorCargoId: cargoId,
      outcomeCode: resultado.outcomeCode ?? null,
      outcomeMensaje: resultado.outcomeMensaje ?? null,
      fechaActualizacion: new Date()
    };

    if (resultado.estado !== EstadoPago.PAGADO) {
      // Nunca retrocede un pago ya pagado.
      await prisma.pagos.updateMany({
        where: { id: pago.id, estado: { not: EstadoPago.PAGADO } },
        data: { ...datos, estado: resultado.estado }
      });
      return;
    }

    let gano;
    try {
      const { count } = await prisma.pagos.updateMany({
        where: { id: pago.id, estado: { not: EstadoPago.PAGADO } },
        data: { ...datos, estado: EstadoPago.PAGADO }
      });
      gano = count === 1;
    } catch (error) {
      // La cuota o la parte ya tiene un pago "pagado" (uq_pagos_cuota_pagado / uq_pagos_parte_pagado): se cobró dos veces.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await prisma.pagos.update({
          where: { id: pago.id },
          data: { ...datos, estado: EstadoPago.PAGADO, cuotaId: null, parteId: null, outcomeMensaje: "Cobro duplicado: devolver" }
        });
        logger.error(`Cobro duplicado de la cuota ${pago.cuotaId ?? "-"} / parte ${pago.parteId ?? "-"} (pago ${pago.id}, cargo ${cargoId}): requiere devolución`);
        return;
      }
      throw error;
    }
    if (!gano) return;

    const pagado = { ...pago, ...datos, estado: EstadoPago.PAGADO };
    await destino.alPagar({ pago: pagado, metodo, cargoId });
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
      cuotaId: pago.cuotaId ?? null,
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
