import { PaymentProvider, ProveedorPagoError } from "./payment-provider.js";

/**
 * Proveedor "simulado": habla por HTTP con el simulador de pasarela
 * (modules/pagos/simulador), igual que CulqiProvider con Culqi. Sirve para
 * probar el pago automático de punta a punta sin cuenta en una pasarela real
 * (docs/specs/pago-automatico R6.5). No usa credenciales de la tienda.
 *
 * El simulador ya usa los estados normalizados (pendiente | pagado | fallido |
 * reembolsado) y montos en soles: no hay conversión.
 */
class SimuladoProvider extends PaymentProvider {
  /**
   * @param {object} opciones
   * @param {string} opciones.url - base del simulador (…/api/v1/simulador-pagos)
   * @param {typeof fetch} [opciones.fetchImpl]
   * @param {number} [opciones.timeoutMs]
   */
  constructor({ url, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
    super();
    this.url = url.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get nombre() {
    return "simulado";
  }

  get requiereCredenciales() {
    return false;
  }

  async createCharge({ tokenId, amount, currency, email, description, metadata }) {
    const cargo = await this.#pedir("POST", "/cargos", {
      token: tokenId, monto: amount, moneda: currency, email, descripcion: description, metadata
    });
    return this.#normalizar(cargo, { proveedorCargoId: cargo.id });
  }

  async getChargeStatus({ chargeId }) {
    const cargo = await this.#pedir("GET", `/cargos/${encodeURIComponent(chargeId)}`);
    return this.#normalizar(cargo);
  }

  async refund({ chargeId }) {
    const cargo = await this.#pedir("POST", `/cargos/${encodeURIComponent(chargeId)}/devolucion`, {});
    return { estado: cargo.estado, raw: cargo };
  }

  parseWebhook(body) {
    const chargeId = body?.data?.id ?? null;
    return { proveedorEventoId: body?.id ?? chargeId ?? "desconocido", tipo: body?.tipo ?? "desconocido", chargeId };
  }

  #normalizar(cargo, extra = {}) {
    return { ...extra, estado: cargo.estado, outcomeCode: cargo.codigo ?? null, outcomeMensaje: cargo.mensaje ?? null, raw: cargo };
  }

  async #pedir(method, ruta, body) {
    let respuesta;
    try {
      respuesta = await this.fetchImpl(`${this.url}${ruta}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new ProveedorPagoError(`Simulador de pagos no disponible: ${error.message}`, {
        status: 502, userMessage: "No pudimos conectar con la pasarela. Intenta de nuevo en un momento."
      });
    }
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new ProveedorPagoError(data.mensaje || `Simulador respondió ${respuesta.status}`, {
        status: respuesta.status, code: data.codigo ?? null, userMessage: data.mensaje ?? null, raw: data
      });
    }
    return data;
  }
}

export default SimuladoProvider;
