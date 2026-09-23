/**
 * Contrato común de un proveedor de pagos (PSP).
 *
 * La capa de servicio (pasarela.service) habla SOLO contra esta interfaz, nunca
 * contra un proveedor concreto. Así agregar Izipay/Niubiz/Mercado Pago o un PSP
 * de QR interoperable (para Plin) es escribir una clase nueva, sin tocar la
 * lógica de negocio ni los endpoints. Ver pasarela-de-pagos/.
 *
 * Convenciones:
 * - Los montos en esta capa van en la unidad de la moneda (S/ 10.50 → 10.5),
 *   NO en céntimos. Cada proveedor convierte internamente si su API lo requiere.
 * - `estado` se normaliza a: PENDIENTE | PAGADO | FALLIDO | REEMBOLSADO.
 * - `credentials` es el objeto ya descifrado de la tienda ({ secretKey, ... }).
 */

/** Estados normalizados de un pago, independientes del proveedor. */
export const EstadoPago = Object.freeze({
  PENDIENTE: "pendiente",
  PAGADO: "pagado",
  FALLIDO: "fallido",
  REEMBOLSADO: "reembolsado"
});

/**
 * Clase base. Los proveedores concretos la extienden e implementan los métodos.
 * Los no implementados lanzan para hacer explícito qué falta soportar.
 */
export class PaymentProvider {
  /** Identificador corto del proveedor (ej. "culqi"). */
  get nombre() {
    throw new Error("PaymentProvider.nombre no implementado");
  }

  /**
   * Crea un cargo a partir de un token generado en el frontend.
   * @param {object} params
   * @param {object} params.credentials - Credenciales descifradas de la tienda.
   * @param {string} params.tokenId - Token de la tarjeta/Yape (tkn_) o card_id (crd_).
   * @param {number} params.amount - Monto en la moneda (soles), no en céntimos.
   * @param {string} params.currency - Código de moneda ("PEN").
   * @param {string} params.email - Email del comprador.
   * @param {string} [params.description]
   * @param {object} [params.antifraud]
   * @param {object} [params.metadata]
   * @returns {Promise<{proveedorCargoId: string, estado: string, outcomeCode: string|null, outcomeMensaje: string|null, raw: object}>}
   */
  async createCharge() {
    throw new Error(`${this.nombre}.createCharge no implementado`);
  }

  /**
   * Consulta el estado real de un cargo en el proveedor (fuente de verdad).
   * @param {object} params
   * @param {object} params.credentials
   * @param {string} params.chargeId
   * @returns {Promise<{estado: string, outcomeCode: string|null, outcomeMensaje: string|null, raw: object}>}
   */
  async getChargeStatus() {
    throw new Error(`${this.nombre}.getChargeStatus no implementado`);
  }

  /**
   * Devuelve (refund) total o parcial de un cargo.
   * @param {object} params
   * @param {object} params.credentials
   * @param {string} params.chargeId
   * @param {number} params.amount - Monto a devolver en la moneda (soles).
   * @param {string} params.reason
   * @returns {Promise<{estado: string, raw: object}>}
   */
  async refund() {
    throw new Error(`${this.nombre}.refund no implementado`);
  }

  /**
   * Extrae de un webhook los datos normalizados que necesita el servicio.
   * NO confía en el payload para dar por pagado: solo identifica el evento y el
   * cargo; el estado se confirma con getChargeStatus.
   * @param {object} body - Cuerpo del webhook ya parseado a objeto.
   * @returns {{proveedorEventoId: string, tipo: string, chargeId: string|null}}
   */
  parseWebhook() {
    throw new Error(`${this.nombre}.parseWebhook no implementado`);
  }
}

export default PaymentProvider;
