import { ConflictError } from "../../utils/errors.js";
import { clave } from "../idiomas/clave.js";

/**
 * Máquinas de estados del mini booking (docs/specs/mini-booking).
 *
 * Hotel y tours (el negocio confirma):
 *   solicitada ─aceptar─▶ aceptada ─subir_captura─▶ pago_en_revision ─verificar─▶ confirmada
 *   Si no hay nada que pagar por adelantado (cobro en destino), aceptar
 *   confirma: solicitada ─confirmar_sin_pago─▶ confirmada (hospedaje-completo A6).
 *
 * Con pago automático (docs/specs/pago-automatico) la pasarela confirma sin
 * revisión: aceptada | por_pagar ─pago_pasarela─▶ confirmada.
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
 * Hotel (docs/specs/ciclo-reserva-hotel): el ciclo de recepción sigue a la
 * confirmación. confirmada ─check_in─▶ hospedada ─check_out─▶ completada.
 *
 * No hay plazos: lo que sigue `solicitada` o `aceptada` al llegar la hora de
 * inicio se anula (`vencida`), y una `confirmada` cuyo servicio ya terminó es
 * `completada` (salvo con ciclo de estadía: la cierra el check-out). Ambas
 * cosas se calculan al leer (`estadoEfectivo`), sin cron.
 */

export const ESTADOS_RESERVA = [
  "solicitada", "aceptada", "por_pagar", "pago_en_revision", "confirmada",
  "completada", "rechazada", "vencida", "cancelada", "no_show", "suspendida", "hospedada"
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
  por_pagar:        { subir_captura: "pago_en_revision", pago_pasarela: "confirmada", cancelar_cliente: "cancelada" },
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

/**
 * Hotel: después de confirmar, recepción registra la entrada y la salida. La
 * reserva hospedada no se cancela ni es no-show: el huésped ya llegó.
 */
export const TRANSICIONES_HOTEL = {
  ...TRANSICIONES,
  // Recepción registra la cancelación de quien la pida, en cualquier momento antes de llegar (C5).
  solicitada:       { ...TRANSICIONES.solicitada, cancelar_negocio: "cancelada" },
  aceptada:         { ...TRANSICIONES.aceptada, cancelar_negocio: "cancelada" },
  pago_en_revision: { ...TRANSICIONES.pago_en_revision, cancelar_cliente: "cancelada", cancelar_negocio: "cancelada" },
  confirmada:       { ...TRANSICIONES.confirmada, check_in: "hospedada", cancelar_cliente: "cancelada" },
  hospedada:        { check_out: "completada" },
  completada:       {}
};

/** Una máquina por tipo de pedido; tour y cancha usan la base. Un tipo sin máquina es un error (antipatrones A3.4). */
export const MAQUINAS = { hotel: TRANSICIONES_HOTEL, tour: TRANSICIONES, evento: TRANSICIONES_EVENTO, local: TRANSICIONES_LOCAL, cancha: TRANSICIONES };

/**
 * Con ciclo de estadía (check-in y check-out), la reserva no se cierra sola al
 * llegar la fecha: la cierra recepción. Se deduce de la máquina, no del rubro.
 */
export const tieneCicloEstadia = (tipo) => Boolean(MAQUINAS[tipo]?.confirmada?.check_in);
/** Tipos de reserva con ciclo de estadía (para filtrar en SQL). */
export const TIPOS_CON_CICLO = Object.keys(MAQUINAS).filter(tieneCicloEstadia);

/**
 * @param {string} actual
 * @param {string} accion
 * @param {string} tipo - tipo del pedido: hotel | tour | evento | local | cancha
 * @returns {string} estado nuevo
 * @throws {ConflictError} TRANSICION_INVALIDA
 */
export function transicionar(actual, accion, tipo) {
  const maquina = MAQUINAS[tipo];
  if (!maquina) throw new Error(`Tipo de reserva sin máquina de estados: ${tipo}`);
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
 * @param {{ estado: string, inicio: Date, fin?: Date|null, apartadoHasta?: Date|null, tipo?: string }} reserva
 * @param {Date} [ahora]
 */
export function estadoEfectivo({ estado, inicio, fin, apartadoHasta = null, tipo = null }, ahora = new Date()) {
  // Lo no atendido vence al terminar su plazo o, sin plazo, a la hora de inicio.
  // Plazo: habitación apartada con pago directo (hospedaje-completo C1), local
  // sin respuesta o sin pago (alquiler-locales R6.4), o llegada tardía de hotel
  // (pedida ya pasado el check-in: vence al terminar el día). Solo la llegada
  // tardía tiene un plazo posterior al inicio.
  if (ESTADOS_ABIERTOS.includes(estado) && (apartadoHasta ?? inicio) <= ahora) return "vencida";
  // Compra de entradas sin captura: vence al terminar el apartado (o al empezar la función).
  if (estado === "por_pagar" && (inicio <= ahora || (apartadoHasta && apartadoHasta <= ahora))) return "vencida";
  if (estado === "confirmada" && !tieneCicloEstadia(tipo) && (fin ?? inicio) <= ahora) return "completada";
  return estado;
}

// En el idioma base: el admin las muestra tal cual y la tienda las traduce con
// `| t` en el idioma de la página (docs/specs/idiomas D7: son claves del catálogo).
const ETIQUETAS = {
  solicitada: clave("Solicitada"),
  aceptada: clave("Aceptada, esperando pago"),
  por_pagar: clave("Pendiente de pago"),
  pago_en_revision: clave("Pago en revisión"),
  confirmada: clave("Confirmada"),
  completada: clave("Completada"),
  rechazada: clave("Rechazada"),
  vencida: clave("Anulada"),
  cancelada: clave("Cancelada"),
  no_show: clave("No se presentó"),
  suspendida: clave("Suspendida, fecha por definir"),
  hospedada: clave("Hospedado")
};

export const etiquetaEstado = (estado) => ETIQUETAS[estado] ?? estado;
