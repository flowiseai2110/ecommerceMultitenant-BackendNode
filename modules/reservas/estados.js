import { ConflictError } from "../../utils/errors.js";

/**
 * Máquinas de estados del mini booking (docs/specs/mini-booking).
 *
 * Hotel y tours (el negocio confirma):
 *   solicitada ─aceptar─▶ aceptada ─subir_captura─▶ pago_en_revision ─verificar─▶ confirmada
 *   Si no hay nada que pagar por adelantado (cobro en destino), aceptar
 *   confirma: solicitada ─confirmar_sin_pago─▶ confirmada (hospedaje-completo A6).
 *
 * Eventos (cupo real, sin solicitud):
 *   por_pagar (cupo apartado) ─subir_captura─▶ pago_en_revision ─verificar─▶ confirmada
 *   Si no sube la captura antes de `apartado_hasta`, la compra vence y el cupo se libera.
 *
 * Locales (docs/specs/alquiler-locales): como hotel, pero la solicitud aparta
 * la fecha solo durante el plazo de respuesta (`apartado_hasta`), la primera
 * cuota verificada confirma y una confirmada puede suspenderse por fuerza
 * mayor (la fecha se libera; lo pagado queda como saldo a favor). Reprogramar
 * no cambia el estado.
 *
 * No hay plazos: lo que sigue `solicitada` o `aceptada` al llegar la hora de
 * inicio se anula (`vencida`), y una `confirmada` cuyo servicio ya terminó es
 * `completada`. Ambas cosas se calculan al leer (`estadoEfectivo`), sin cron.
 */

export const ESTADOS_RESERVA = [
  "solicitada", "aceptada", "por_pagar", "pago_en_revision", "confirmada",
  "completada", "rechazada", "vencida", "cancelada", "no_show", "suspendida"
];

/** Esperan algo del negocio o del cliente; vencen a la hora de inicio. */
export const ESTADOS_ABIERTOS = ["solicitada", "aceptada"];

/** Cuentan para el máximo de solicitudes abiertas por cliente. */
export const ESTADOS_EN_CURSO = ["solicitada", "aceptada", "pago_en_revision"];

export const TRANSICIONES = {
  solicitada:       { aceptar: "aceptada", confirmar_sin_pago: "confirmada", rechazar: "rechazada", cancelar_cliente: "cancelada" },
  aceptada:         { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada" },
  // No vence: el cliente ya pagó y el negocio debe confirmar o devolver.
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "aceptada", subir_captura: "pago_en_revision" },
  confirmada:       { no_show: "no_show", cancelar_negocio: "cancelada" },
  // El negocio suele marcar la no presentación después de la hora de salida.
  completada:       { no_show: "no_show" }
};

export const TRANSICIONES_EVENTO = {
  por_pagar:        { subir_captura: "pago_en_revision", cancelar_cliente: "cancelada" },
  // Mientras está en revisión el cupo sigue apartado (no vence).
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "por_pagar", subir_captura: "pago_en_revision", cancelar_negocio: "cancelada" },
  confirmada:       { cancelar_negocio: "cancelada" }
};

/**
 * Las cuotas siguientes a la primera no son transiciones: se pagan y verifican
 * con la reserva ya `confirmada` (operaciones sobre `reserva_cuotas`).
 */
export const TRANSICIONES_LOCAL = {
  solicitada:       { aceptar: "aceptada", rechazar: "rechazada", cancelar_cliente: "cancelada" },
  aceptada:         { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada" },
  pago_en_revision: { verificar: "confirmada", rechazar_pago: "aceptada", subir_captura: "pago_en_revision" },
  confirmada:       { reprogramar: "confirmada", suspender: "suspendida", cancelar_negocio: "cancelada", no_show: "no_show" },
  suspendida:       { reprogramar: "confirmada", cancelar_negocio: "cancelada" },
  completada:       { no_show: "no_show" }
};

const MAQUINAS = { evento: TRANSICIONES_EVENTO, local: TRANSICIONES_LOCAL };

/**
 * @param {string} actual
 * @param {string} accion
 * @param {string} [tipo] - tipo del pedido: hotel | tour | evento | local
 * @returns {string} estado nuevo
 * @throws {ConflictError} TRANSICION_INVALIDA
 */
export function transicionar(actual, accion, tipo = "hotel") {
  const maquina = MAQUINAS[tipo] ?? TRANSICIONES;
  const nuevo = maquina[actual]?.[accion];
  if (!nuevo) {
    // El errorHandler solo expone `details`: el mensaje va también ahí para la interfaz.
    const message = `La reserva está ${etiquetaEstado(actual).toLowerCase()} y ya no admite esta acción`;
    throw new ConflictError(message, { message, motivo: "TRANSICION_INVALIDA", estado: actual, accion });
  }
  return nuevo;
}

/**
 * Estado real a una hora dada.
 * @param {{ estado: string, inicio: Date, fin?: Date|null, apartadoHasta?: Date|null }} reserva
 * @param {Date} [ahora]
 */
export function estadoEfectivo({ estado, inicio, fin, apartadoHasta = null }, ahora = new Date()) {
  if (ESTADOS_ABIERTOS.includes(estado) && inicio <= ahora) return "vencida";
  // Habitación apartada con pago directo (hospedaje-completo C1) o local
  // aceptado sin pagar: si no se pagó a tiempo, se anula. En locales, una
  // solicitud sin respuesta vence al terminar su plazo (alquiler-locales R6.4);
  // hotel y tours no ponen `apartadoHasta` en sus solicitudes.
  if (["solicitada", "aceptada"].includes(estado) && apartadoHasta && apartadoHasta <= ahora) return "vencida";
  // Compra de entradas sin captura: vence al terminar el apartado (o al empezar la función).
  if (estado === "por_pagar" && (inicio <= ahora || (apartadoHasta && apartadoHasta <= ahora))) return "vencida";
  if (estado === "confirmada" && (fin ?? inicio) <= ahora) return "completada";
  return estado;
}

const ETIQUETAS = {
  solicitada: "Solicitada",
  aceptada: "Aceptada, esperando pago",
  por_pagar: "Pendiente de pago",
  pago_en_revision: "Pago en revisión",
  confirmada: "Confirmada",
  completada: "Completada",
  rechazada: "Rechazada",
  vencida: "Anulada",
  cancelada: "Cancelada",
  no_show: "No se presentó",
  suspendida: "Suspendida, fecha por definir"
};

export const etiquetaEstado = (estado) => ETIQUETAS[estado] ?? estado;
