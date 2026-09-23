import config from "../../../config/index.js";
import { logger } from "../../../config/logger.js";

/**
 * Cliente HTTP de bajo nivel para la API v2 de Culqi.
 *
 * Sin dependencias externas: usa `fetch` nativo de Node. Cada instancia se
 * construye con la llave secreta (sk_) de UNA tienda — nunca hay una llave
 * global. La capa superior (culqi.provider) resuelve las credenciales por
 * tienda desde tienda_pasarela_config antes de instanciar el cliente.
 *
 * Documentación: https://apidocs.culqi.com/  ·  ver pasarela-de-pagos/01-*.md
 */
class CulqiClient {
  /**
   * @param {object} params
   * @param {string} params.secretKey - Llave secreta sk_test_/sk_live_ de la tienda.
   */
  constructor({ secretKey }) {
    if (!secretKey) {
      throw new Error("CulqiClient requiere una llave secreta (sk_)");
    }
    this.secretKey = secretKey;
    this.baseUrl = config.pagos.culqi.apiBaseUrl;
    this.timeoutMs = config.pagos.culqi.timeoutMs;
  }

  /**
   * Realiza una petición HTTP a la API de Culqi con timeout y manejo de errores.
   * @param {string} method - GET | POST
   * @param {string} path - Ruta relativa (ej. "/charges")
   * @param {object|null} body - Cuerpo JSON (solo POST)
   * @returns {Promise<object>} respuesta JSON parseada
   * @throws {CulqiApiError} si Culqi responde con error (status >= 400)
   */
  async #request(method, path, body = null) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new CulqiApiError("Timeout al comunicar con Culqi", { status: 504 });
      }
      throw new CulqiApiError(`Error de red con Culqi: ${error.message}`, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new CulqiApiError("Respuesta no-JSON de Culqi", { status: response.status });
    }

    if (!response.ok) {
      // Culqi devuelve { object: "error", type, code, merchant_message, user_message }
      const message = data.merchant_message || data.user_message || data.message || "Error en Culqi";
      logger.warn(`Culqi API ${method} ${path} → ${response.status}: ${data.code || ""} ${message}`);
      throw new CulqiApiError(message, {
        status: response.status,
        code: data.code,
        userMessage: data.user_message,
        raw: data
      });
    }

    return data;
  }

  /**
   * Crea un cargo (charge). El monto debe ir en céntimos (enteros).
   * @param {object} params
   * @param {number} params.amount - Monto en céntimos (S/ 10.00 → 1000).
   * @param {string} params.currencyCode - "PEN".
   * @param {string} params.email - Email del comprador.
   * @param {string} params.sourceId - token_id (tkn_) o card_id (crd_).
   * @param {string} [params.description] - Descripción visible.
   * @param {object} [params.antifraudDetails] - Datos antifraude (first_name, ...).
   * @param {object} [params.metadata] - Metadata libre (tiendaId, pedidoId, ...).
   * @param {boolean} [params.capture=true] - true = cobra; false = solo autoriza.
   * @returns {Promise<object>} charge de Culqi
   */
  async createCharge({ amount, currencyCode, email, sourceId, description, antifraudDetails, metadata, capture = true }) {
    return this.#request("POST", "/charges", {
      amount,
      currency_code: currencyCode,
      email,
      source_id: sourceId,
      capture,
      ...(description ? { description } : {}),
      ...(antifraudDetails ? { antifraud_details: antifraudDetails } : {}),
      ...(metadata ? { metadata } : {})
    });
  }

  /**
   * Obtiene un cargo por su id. Se usa para confirmar el estado real desde la
   * fuente de verdad (Culqi) al procesar un webhook, sin depender solo del
   * payload recibido.
   * @param {string} chargeId - chr_...
   * @returns {Promise<object>} charge
   */
  async getCharge(chargeId) {
    return this.#request("GET", `/charges/${chargeId}`);
  }

  /**
   * Crea una devolución (refund) total o parcial sobre un cargo.
   * @param {object} params
   * @param {number} params.amount - Monto a devolver en céntimos.
   * @param {string} params.chargeId - chr_... del cargo original.
   * @param {string} params.reason - Motivo (solicitud_comprador | duplicado | fraudulento).
   * @returns {Promise<object>} refund
   */
  async createRefund({ amount, chargeId, reason }) {
    return this.#request("POST", "/refunds", {
      amount,
      charge_id: chargeId,
      reason
    });
  }
}

/**
 * Error tipado de la API de Culqi. Lleva el status HTTP y el code del proveedor
 * para que la capa de servicio pueda traducirlo a un AppError apropiado.
 */
export class CulqiApiError extends Error {
  constructor(message, { status = 502, code = null, userMessage = null, raw = null } = {}) {
    super(message);
    this.name = "CulqiApiError";
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.raw = raw;
  }
}

export default CulqiClient;
