import { diaSemana } from "../tiempo.js";
import { FERIADOS } from "../../libro-reclamaciones/plazos.js";

/**
 * Horario y precio de las canchas (docs/specs/alquiler-canchas R2, R3, R8).
 * Funciones puras: las usan la cotización, la agenda de la vitrina y la del admin.
 *
 * El día se divide en bloques de 30 minutos desde la apertura hasta el cierre.
 * Cada bloque es de tarifa día o noche y vale la mitad de esa tarifa: un turno
 * de 17:00 a 19:00 con la noche desde las 18:00 cobra una hora de cada una.
 */

/** Duraciones de turno que puede ofrecer un complejo (minutos). */
export const DURACIONES_CANCHA = Object.freeze([60, 90, 120, 180]);
export const FORMATOS_CANCHA = Object.freeze(["F5", "F6", "F7", "F8", "F9", "F11"]);
export const BLOQUE_MIN = 30;

const redondear = (n) => Math.round(n * 100) / 100;

/** "18:30" → 1110. */
export const minutosHora = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/** El cierre "00:00" es la medianoche: el final del día. */
export const minutosCierre = (hora) => minutosHora(hora) || 24 * 60;

/** 1110 → "18:30"; 1440 → "00:00". */
export const horaDeMinutos = (min) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const esFeriado = (fecha, feriados) => (feriados[Number(fecha.slice(0, 4))] ?? []).includes(fecha);

/** Sábado, domingo o feriado con tarifa noche todo el día (R2, R8). */
export function todoElDiaNoche(fecha, config, feriados = FERIADOS) {
  if (!config.canchaFindeNoche) return false;
  const dia = diaSemana(fecha);
  return dia === 0 || dia === 6 || esFeriado(fecha, feriados);
}

/**
 * Bloques de 30 minutos del día, de la apertura al cierre.
 * @returns {Array<{ min: number, hora: string, noche: boolean }>}
 */
export function bloquesDelDia(fecha, config, feriados = FERIADOS) {
  const todoNoche = todoElDiaNoche(fecha, config, feriados);
  const desde = minutosHora(config.canchaApertura);
  const hasta = minutosCierre(config.canchaCierre);
  const noche = minutosHora(config.canchaInicioNoche);
  const bloques = [];
  for (let min = desde; min < hasta; min += BLOQUE_MIN) {
    bloques.push({ min, hora: horaDeMinutos(min), noche: todoNoche || min >= noche });
  }
  return bloques;
}

/** Horas de inicio que se ofrecen (en punto) para una duración: el turno debe terminar antes del cierre. */
export function horasDeInicio(config, duracionMin) {
  const horas = [];
  const cierre = minutosCierre(config.canchaCierre);
  for (let min = minutosHora(config.canchaApertura); min + duracionMin <= cierre; min += 60) horas.push(horaDeMinutos(min));
  return horas;
}

/**
 * Tramos día / noche de un turno con su precio (R3). Bloques seguidos de la
 * misma tarifa forman un tramo.
 * @param {{ fecha: string, hora: string, duracionMin: number, cancha: { precioDia: number, precioNoche: number }, config: object }} p
 * @returns {Array<{ tarifa: "dia"|"noche", desde: string, hasta: string, minutos: number, precioHora: number, total: number }>}
 */
export function tramosDelTurno({ fecha, hora, duracionMin, cancha, config, feriados = FERIADOS }) {
  const inicio = minutosHora(hora);
  const tramos = [];
  for (const b of bloquesDelDia(fecha, config, feriados)) {
    if (b.min < inicio || b.min >= inicio + duracionMin) continue;
    const tarifa = b.noche ? "noche" : "dia";
    const ultimo = tramos.at(-1);
    if (ultimo?.tarifa === tarifa) {
      ultimo.minutos += BLOQUE_MIN;
      ultimo.hasta = horaDeMinutos(b.min + BLOQUE_MIN);
    } else {
      tramos.push({
        tarifa, desde: b.hora, hasta: horaDeMinutos(b.min + BLOQUE_MIN), minutos: BLOQUE_MIN,
        precioHora: Number(tarifa === "noche" ? cancha.precioNoche : cancha.precioDia)
      });
    }
  }
  return tramos.map((t) => ({ ...t, total: redondear((t.precioHora * t.minutos) / 60) }));
}

/** Precio "desde" de una cancha: la más baja de sus dos tarifas. */
export const precioDesdeCancha = (c) => Math.min(Number(c.precioDia), Number(c.precioNoche));
