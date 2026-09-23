import CulqiClient from "./culqi.client.js";
import { PaymentProvider, EstadoPago } from "./payment-provider.js";

/**
 * Implementación de PaymentProvider para Culqi (tarjetas + Yape).
 *
 * Traduce entre nuestra representación normalizada (montos en soles, estados
 * PENDIENTE/PAGADO/...) y la API de Culqi (montos en céntimos, outcome.type).
 */
class CulqiProvider extends PaymentProvider {
  get nombre() {
    return "culqi";
  }

  /**
   * Convierte soles a céntimos enteros, evitando errores de coma flotante.
   * @param {number} soles
   * @returns {number} céntimos
   */
  #aCentimos(soles) {
    return Math.round(Number(soles) * 100);
  }

  /**
   * Mapea un charge de Culqi a nuestro estado normalizado.
   * Un cargo con outcome.type "venta_exitosa" está pagado; cualquier otro
   * resultado presente se considera fallido. Sin outcome → aún pendiente.
   * @param {object} charge
   * @returns {string} EstadoPago
   */
  #estadoDesdeCharge(charge) {
    const tipo = charge?.outcome?.type;
    if (tipo === "venta_exitosa") return EstadoPago.PAGADO;
    if (tipo) return EstadoPago.FALLIDO;
    return EstadoPago.PENDIENTE;
  }

  async createCharge({ credentials, tokenId, amount, currency, email, description, antifraud, metadata }) {
    const client = new CulqiClient({ secretKey: credentials.secretKey });

    const charge = await client.createCharge({
      amount: this.#aCentimos(amount),
      currencyCode: currency,
      email,
      sourceId: tokenId,
      description,
      antifraudDetails: antifraud,
      metadata,
      capture: true
    });

    return {
      proveedorCargoId: charge.id,
      estado: this.#estadoDesdeCharge(charge),
      outcomeCode: charge?.outcome?.code ?? null,
      outcomeMensaje: charge?.outcome?.merchant_message ?? null,
      raw: charge
    };
  }

  async getChargeStatus({ credentials, chargeId }) {
    const client = new CulqiClient({ secretKey: credentials.secretKey });
    const charge = await client.getCharge(chargeId);

    return {
      estado: this.#estadoDesdeCharge(charge),
      outcomeCode: charge?.outcome?.code ?? null,
      outcomeMensaje: charge?.outcome?.merchant_message ?? null,
      raw: charge
    };
  }

  async refund({ credentials, chargeId, amount, reason }) {
    const client = new CulqiClient({ secretKey: credentials.secretKey });
    const refund = await client.createRefund({
      amount: this.#aCentimos(amount),
      chargeId,
      reason: reason || "solicitud_comprador"
    });

    return { estado: EstadoPago.REEMBOLSADO, raw: refund };
  }

  parseWebhook(body) {
    // Culqi envía { object: "event", id, type, data: { object: "charge", id, ... } }.
    // El id del cargo (chr_) es lo que usamos para reconfirmar contra la API.
    const chargeId = body?.data?.id ?? null;
    return {
      // Preferimos el id del evento; si no viene, el del cargo sirve como clave
      // de idempotencia (evita reprocesar el mismo cargo).
      proveedorEventoId: body?.id ?? chargeId ?? "desconocido",
      tipo: body?.type ?? "desconocido",
      chargeId
    };
  }
}

export default CulqiProvider;
