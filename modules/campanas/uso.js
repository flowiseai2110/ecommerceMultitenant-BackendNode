// Ventana de uso de una campaña (docs/specs/campanas-cuando R1): lógica pura.
//
// Una campaña de un rubro que recibe reservas puede decir hasta cuándo se usa
// lo reservado. La propia lleva fechas (`desde`, `hasta`); la del catálogo, días
// relativos porque se repite cada año. Es solo informativa: no toca precios,
// cupos ni reglas de la reserva.

import { fechaCivilLima, inicioDiaLima } from "./calendario.js";
import { datosDe } from "../negocio/datos.js";

const pad = (n) => String(n).padStart(2, "0");

/** Fecha civil → "YYYY-MM-DD". */
export const claveDia = ({ anio, mes, dia }) => `${anio}-${pad(mes)}-${pad(dia)}`;

/** Fecha civil `n` días después (o antes, con n negativo). */
export function sumarDias(civil, n) {
  return fechaCivilLima(inicioDiaLima(civil, n));
}

/** Último día de calendario que cubre la ventana (el que contiene `fin - 1 ms`). */
export function ultimoDia(v) {
  return fechaCivilLima(new Date(v.fin.getTime() - 1));
}

/** Hay uso declarado (propio con `hasta` o del catálogo con días). */
export function tieneUso(uso) {
  return Boolean(uso && (uso.hasta || uso.hastaDiasDespues != null));
}

/**
 * Uso resuelto de una campaña para una de sus ventanas: `{ desde, hasta }` en
 * "YYYY-MM-DD" (`desde` null = desde que reserva), o null si no tiene (R1.2).
 * @param {object} uso - `c.uso` de la campaña efectiva
 * @param {boolean} esPreset - del catálogo (días relativos) o propia (fechas)
 * @param {object} v - ventana { inicio, fin } (Date)
 */
export function usoResuelto(uso, esPreset, v) {
  if (!tieneUso(uso) || !v) return null;
  if (!esPreset) return { desde: uso.desde ?? null, hasta: uso.hasta };
  const primero = fechaCivilLima(v.inicio);
  return {
    desde: uso.desdeDiasDespuesInicio != null ? claveDia(sumarDias(primero, uso.desdeDiasDespuesInicio)) : null,
    hasta: claveDia(sumarDias(ultimoDia(v), uso.hastaDiasDespues))
  };
}

/**
 * Una tienda que no recibe reservas (capacidad `recibeReservas`) no usa fechas
 * de uso (R1.1). Pura, para testearla: devuelve el mensaje de error o null.
 */
export function errorDeUso(campanas, tipoNegocio) {
  if (datosDe(tipoNegocio).recibeReservas) return null;
  return (campanas ?? []).some((c) => tieneUso(c.uso)) ? "Esta tienda no usa fechas de uso" : null;
}
