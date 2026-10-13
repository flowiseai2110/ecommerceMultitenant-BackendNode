import { randomBytes } from "node:crypto";

/**
 * Simulador de pasarela de pagos (docs/specs/pago-automatico R6).
 *
 * Una pasarela falsa para probar el pago automático sin Culqi: tokeniza
 * tarjetas o Yape, cobra según tarjetas de prueba y, si el cargo queda
 * pendiente, lo resuelve más tarde y avisa por webhook, igual que una pasarela
 * real. Todo vive en memoria: al reiniciar el servidor se pierde.
 */

/** Tarjetas de prueba (R6.3). Cualquier otra se rechaza. */
export const TARJETAS_PRUEBA = Object.freeze({
  "4111111111111111": { estado: "pagado" },
  "4000000000000002": { estado: "fallido", codigo: "fondos_insuficientes", mensaje: "Tu tarjeta no tiene fondos suficientes." },
  "4000000000000069": { estado: "fallido", codigo: "tarjeta_vencida", mensaje: "Tu tarjeta está vencida." },
  "4000000000000119": { estado: "pendiente" }
});

/** OTP de Yape que aprueba el pago; cualquier otro se rechaza. */
export const OTP_YAPE = "123456";

const TOKEN_VIGENCIA_MS = 10 * 60 * 1000;
const RECHAZO_GENERICO = { estado: "fallido", codigo: "tarjeta_rechazada", mensaje: "Tu tarjeta fue rechazada. Prueba con otra." };

/** Error con forma de respuesta de pasarela: status HTTP, código y mensaje para el comprador. */
export class SimuladorError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const id = (prefijo) => `${prefijo}_sim_${randomBytes(9).toString("hex")}`;
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");

export class SimuladorPasarela {
  /**
   * @param {object} [opciones]
   * @param {() => number} [opciones.ahora] - reloj (ms), inyectable en tests
   * @param {(evento: object) => Promise<void>|void} [opciones.notificar] - envía el webhook
   * @param {number} [opciones.demoraPendienteMs] - cuándo se paga un cargo pendiente
   * @param {(fn: Function, ms: number) => void} [opciones.programar] - setTimeout inyectable
   */
  constructor({ ahora = Date.now, notificar = () => {}, demoraPendienteMs = 5000, programar } = {}) {
    this.ahora = ahora;
    this.notificar = notificar;
    this.demoraPendienteMs = demoraPendienteMs;
    this.programar = programar ?? ((fn, ms) => setTimeout(fn, ms).unref?.());
    this.tokens = new Map();
    this.cargos = new Map();
  }

  /**
   * Tokeniza una tarjeta o un pago con Yape. El comercio nunca ve la tarjeta:
   * solo el token, que sirve una vez y dura 10 minutos.
   */
  tokenizar({ tarjeta, yape, email } = {}) {
    if (tarjeta) {
      const numero = soloDigitos(tarjeta.numero);
      if (numero.length < 13 || numero.length > 19) throw new SimuladorError(400, "numero_invalido", "El número de tarjeta no es válido.");
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(tarjeta.vencimiento ?? ""))) throw new SimuladorError(400, "vencimiento_invalido", "La fecha de vencimiento debe ser MM/AA.");
      if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ""))) throw new SimuladorError(400, "cvv_invalido", "El CVV no es válido.");
      return this.#guardarToken({ tipo: "tarjeta", numero, ultimos4: numero.slice(-4), email });
    }
    if (yape) {
      const celular = soloDigitos(yape.celular);
      if (!/^9\d{8}$/.test(celular)) throw new SimuladorError(400, "celular_invalido", "El celular de Yape debe tener 9 dígitos y empezar con 9.");
      if (!/^\d{6}$/.test(String(yape.otp ?? ""))) throw new SimuladorError(400, "otp_invalido", "El código de aprobación de Yape tiene 6 dígitos.");
      return this.#guardarToken({ tipo: "yape", otp: String(yape.otp), ultimos4: celular.slice(-4), email });
    }
    throw new SimuladorError(400, "datos_faltantes", "Envía una tarjeta o un pago con Yape.");
  }

  /** Cobra un token. Rechazos responden 402 como una pasarela real. */
  cobrar({ token, monto, moneda = "PEN", email, descripcion = null, metadata = null } = {}) {
    const datos = this.tokens.get(token);
    if (!datos || datos.usado || datos.expira <= this.ahora()) {
      throw new SimuladorError(400, "token_invalido", "El token no existe, ya se usó o venció.");
    }
    if (!(Number(monto) > 0)) throw new SimuladorError(400, "monto_invalido", "El monto debe ser mayor a cero.");
    datos.usado = true;

    const resultado = datos.tipo === "yape"
      ? (datos.otp === OTP_YAPE ? { estado: "pagado" } : { estado: "fallido", codigo: "yape_rechazado", mensaje: "Yape no aprobó el pago. Revisa el código e intenta de nuevo." })
      : (TARJETAS_PRUEBA[datos.numero] ?? RECHAZO_GENERICO);

    const cargo = {
      id: id("chr"),
      estado: resultado.estado,
      codigo: resultado.codigo ?? (resultado.estado === "pagado" ? "aprobado" : "en_proceso"),
      mensaje: resultado.mensaje ?? null,
      monto: Number(monto),
      moneda,
      email: email ?? datos.email ?? null,
      metodo: datos.tipo,
      ultimos4: datos.ultimos4,
      descripcion,
      metadata,
      creadoEn: new Date(this.ahora()).toISOString()
    };
    this.cargos.set(cargo.id, cargo);

    if (cargo.estado === "fallido") {
      throw new SimuladorError(402, cargo.codigo, cargo.mensaje);
    }
    if (cargo.estado === "pendiente") {
      this.programar(() => this.#resolverPendiente(cargo.id), this.demoraPendienteMs);
    }
    return { ...cargo };
  }

  obtener(cargoId) {
    const cargo = this.cargos.get(cargoId);
    if (!cargo) throw new SimuladorError(404, "cargo_no_existe", "El cargo no existe.");
    return { ...cargo };
  }

  devolver(cargoId) {
    const cargo = this.cargos.get(cargoId);
    if (!cargo) throw new SimuladorError(404, "cargo_no_existe", "El cargo no existe.");
    if (cargo.estado !== "pagado") throw new SimuladorError(409, "no_devolvible", "Solo se devuelve un cargo pagado.");
    cargo.estado = "reembolsado";
    return { ...cargo };
  }

  #guardarToken(datos) {
    const token = { id: id("tkn"), ...datos, usado: false, expira: this.ahora() + TOKEN_VIGENCIA_MS };
    this.tokens.set(token.id, token);
    return { id: token.id, tipo: token.tipo, ultimos4: token.ultimos4 };
  }

  async #resolverPendiente(cargoId) {
    const cargo = this.cargos.get(cargoId);
    if (!cargo || cargo.estado !== "pendiente") return;
    cargo.estado = "pagado";
    cargo.codigo = "aprobado";
    await this.notificar({ id: id("evt"), tipo: "cargo.actualizado", data: { id: cargo.id, estado: cargo.estado } });
  }
}
