import { ConflictError } from "../../utils/errors.js";

/**
 * Máquina de estados de una reserva de hotel o tour (docs/specs/mini-booking).
 *
 *   solicitada ─aceptar─▶ aceptada ─subir_captura─▶ pago_en_revision ─verificar─▶ confirmada
 *
 * No hay plazos: lo que sigue `solicitada` o `aceptada` al llegar la hora de
 * inicio se anula (`vencida`), y una `confirmada` cuyo servicio ya terminó es
 * `completada`. Ambas cosas se calculan al leer (`estadoEfectivo`), sin cron.
 */

export const ESTADOS_RESERVA = [
  "solicitada", "aceptada", "pago_en_revision", "confirmada",
  "completada", "rechazada", "vencida", "cancelada", "no_show"
];

/** Esperan algo del negocio o del cliente; vencen a la hora de inicio. */
export const ESTADOS_ABIERTOS = ["solicitada", "aceptada"];

/** Cuentan para el máximo de solicitudes abiertas por cliente. */
export const ESTADOS_EN_CURSO = ["solicitada", "aceptada", "pago_en_revision"];

export const TRANSICIONES = {
  solicitada:       { aceptar: "aceptada", rechazar: "rechazada", cancelar_cliente: "cancelada" },
  aceptada:         { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada" },
  // No vence: el cliente ya pagó y el negocio debe confirmar o devolver.
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "aceptada", subir_captura: "pago_en_revision" },
  confirmada:       { no_show: "no_show", cancelar_negocio: "cancelada" },
  // El negocio suele marcar la no presentación después de la hora de salida.
  completada:       { no_show: "no_show" }
};

/**
 * @param {string} actual
 * @param {string} accion
 * @returns {string} estado nuevo
 * @throws {ConflictError} TRANSICION_INVALIDA
 */
export function transicionar(actual, accion) {
  const nuevo = TRANSICIONES[actual]?.[accion];
  if (!nuevo) {
    // El errorHandler solo expone `details`: el mensaje va también ahí para la interfaz.
    const message = `La reserva está ${etiquetaEstado(actual).toLowerCase()} y ya no admite esta acción`;
    throw new ConflictError(message, { message, motivo: "TRANSICION_INVALIDA", estado: actual, accion });
  }
  return nuevo;
}

/**
 * Estado real a una hora dada.
 * @param {{ estado: string, inicio: Date, fin?: Date|null }} reserva
 * @param {Date} [ahora]
 */
export function estadoEfectivo({ estado, inicio, fin }, ahora = new Date()) {
  if (ESTADOS_ABIERTOS.includes(estado) && inicio <= ahora) return "vencida";
  if (estado === "confirmada" && (fin ?? inicio) <= ahora) return "completada";
  return estado;
}

const ETIQUETAS = {
  solicitada: "Solicitada",
  aceptada: "Aceptada, esperando pago",
  pago_en_revision: "Pago en revisión",
  confirmada: "Confirmada",
  completada: "Completada",
  rechazada: "Rechazada",
  vencida: "Anulada",
  cancelada: "Cancelada",
  no_show: "No se presentó"
};

export const etiquetaEstado = (estado) => ETIQUETAS[estado] ?? estado;
