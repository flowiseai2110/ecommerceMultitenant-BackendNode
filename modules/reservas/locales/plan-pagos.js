import { sumarDias } from "../tiempo.js";

/**
 * Plan de pagos de una reserva de local (docs/specs/alquiler-locales R7).
 * Funciones puras: fechas "YYYY-MM-DD" (hora de Lima), montos en soles.
 *
 * Plan por defecto (R7.2): la separación vence con el apartado; el resto se
 * reparte en hasta N cuotas iguales que vencen hasta la fecha límite del
 * saldo (evento − saldo_dias_antes); la garantía vence con el saldo. Si la
 * fecha del evento ya está dentro de ese plazo, todo el resto vence en 2 días.
 */

export const CONCEPTOS = [
  "separacion", "cuota", "saldo", "garantia", "hora_extra", "descorche", "danos", "penalidad", "diferencia", "cargo_reprogramacion"
];

const redondear = (n) => Math.round(n * 100) / 100;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const minFecha = (a, b) => (a < b ? a : b);

/**
 * @param {object} p
 * @param {number} p.total - total de la reserva (sin garantía)
 * @param {number} p.separacion - lo que fija la fecha
 * @param {number} [p.garantia]
 * @param {{ saldoDiasAntes: number, maxCuotas: number, apartadoHoras: number }} p.config
 * @param {string} p.fechaEvento - "YYYY-MM-DD"
 * @param {string} p.hoy - "YYYY-MM-DD"
 * @returns {Array<{ numero: number, concepto: string, monto: number, venceEn: string }>}
 */
export function generarPlan({ total, separacion, garantia = 0, config, fechaEvento, hoy }) {
  const cuotas = [];
  const agregar = (concepto, monto, venceEn) => {
    if (monto > 0) cuotas.push({ numero: cuotas.length + 1, concepto, monto: redondear(monto), venceEn });
  };

  // La separación se paga mientras dura el apartado (nunca después del evento).
  const venceSeparacion = minFecha(sumarDias(hoy, Math.max(Math.ceil((config.apartadoHoras ?? 48) / 24), 1)), fechaEvento);
  const sep = redondear(Math.min(separacion, total));
  agregar("separacion", sep, venceSeparacion);

  const resto = redondear(total - sep);
  let limite = sumarDias(fechaEvento, -(config.saldoDiasAntes ?? 0));
  // Evento cercano: todo el resto vence en 2 días (sin pasar del evento).
  if (limite <= venceSeparacion) limite = minFecha(sumarDias(hoy, 2), fechaEvento);

  if (resto > 0) {
    const span = Math.max(diasEntre(venceSeparacion, limite), 0);
    const n = Math.max(Math.min(config.maxCuotas ?? 1, span || 1), 1);
    const base = Math.floor((resto / n) * 100) / 100;
    for (let i = 1; i <= n; i++) {
      // Los céntimos sobrantes van en la última cuota.
      const monto = i === n ? resto - base * (n - 1) : base;
      const vence = i === n ? limite : sumarDias(venceSeparacion, Math.round((i * span) / n));
      agregar(i === n ? "saldo" : "cuota", monto, vence);
    }
  }

  agregar("garantia", garantia, limite > venceSeparacion ? limite : venceSeparacion);
  return cuotas;
}

const vigentes = (cuotas) => cuotas.filter(c => c.estado !== "anulada");
const montoDe = (c) => Number(c.monto);

/** Lo pagado de la reserva, SIN la garantía (R7.8): es lo que va a `pedidos.monto_pagado`. */
export const montoPagadoDe = (cuotas) =>
  redondear(vigentes(cuotas).filter(c => c.estado === "pagada" && c.concepto !== "garantia").reduce((s, c) => s + montoDe(c), 0));

/** Una cuota vencida sin pagar: indicador de mora, no estado (R7.7). */
export const enMora = (cuotas, hoy) =>
  vigentes(cuotas).some(c => c.estado === "pendiente" && fechaDe(c.venceEn) < hoy);

const fechaDe = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/**
 * Resumen para el seguimiento y la bandeja (R7.5): total, pagado, saldo,
 * próxima cuota, garantía en custodia y mora.
 */
export function resumenPlan(cuotas, hoy) {
  const vig = vigentes(cuotas);
  const cargos = vig.filter(c => c.concepto !== "garantia");
  const total = redondear(cargos.reduce((s, c) => s + montoDe(c), 0));
  const pagado = montoPagadoDe(cuotas);
  const garantias = vig.filter(c => c.concepto === "garantia");
  const proxima = vig.filter(c => c.estado === "pendiente" || c.estado === "en_revision")
    .sort((a, b) => fechaDe(a.venceEn).localeCompare(fechaDe(b.venceEn)) || a.numero - b.numero)[0] ?? null;
  return {
    total,
    pagado,
    saldo: redondear(total - pagado),
    garantia: redondear(garantias.reduce((s, c) => s + montoDe(c), 0)),
    garantiaEnCustodia: redondear(garantias.filter(c => c.estado === "pagada").reduce((s, c) => s + montoDe(c), 0)),
    proximaCuota: proxima ? { id: proxima.id ?? null, numero: proxima.numero, concepto: proxima.concepto, monto: montoDe(proxima), venceEn: fechaDe(proxima.venceEn), estado: proxima.estado } : null,
    enMora: enMora(cuotas, hoy),
    pagos: vig.filter(c => c.estado === "pagada").length
  };
}

/** El plan se edita solo antes del primer pago (R7.2): después, 409 PLAN_BLOQUEADO. */
export const planBloqueado = (cuotas) => cuotas.some(c => c.estado === "pagada" || c.estado === "en_revision");

/**
 * Valida un plan editado por el negocio: las cuotas (sin garantía) suman el
 * total, la garantía es la configurada, las fechas van de hoy al evento y la
 * primera es la separación.
 * @returns {string[]} errores (vacío = válido)
 */
export function validarPlan(cuotas, { total, garantia = 0, fechaEvento, hoy }) {
  const errores = [];
  if (!cuotas.length) return ["El plan necesita al menos una cuota"];
  const cargos = cuotas.filter(c => c.concepto !== "garantia");
  const suma = redondear(cargos.reduce((s, c) => s + Number(c.monto), 0));
  if (Math.abs(suma - redondear(total)) > 0.009) errores.push(`Las cuotas suman S/ ${suma.toFixed(2)} y el total es S/ ${Number(total).toFixed(2)}`);
  const sumaGarantia = redondear(cuotas.filter(c => c.concepto === "garantia").reduce((s, c) => s + Number(c.monto), 0));
  if (Math.abs(sumaGarantia - redondear(garantia)) > 0.009) errores.push(`La garantía es de S/ ${Number(garantia).toFixed(2)}`);
  if (cuotas.some(c => !(Number(c.monto) > 0))) errores.push("Cada cuota debe ser mayor a cero");
  if (cuotas.some(c => c.venceEn < hoy)) errores.push("Una cuota no puede vencer en el pasado");
  if (cuotas.some(c => c.venceEn > fechaEvento)) errores.push("Una cuota no puede vencer después del evento");
  if (cargos.length && cuotas[0].concepto !== "separacion") errores.push("La primera cuota es la separación");
  return errores;
}
