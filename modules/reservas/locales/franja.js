import { diaSemana, instanteLima, sumarDias } from "../tiempo.js";

/**
 * Franjas horarias de un salón (docs/specs/alquiler-locales R1.3, R2.4, R3.3).
 *
 * Todo en hora de Lima (tiempo.js). Una franja que pasa la medianoche
 * pertenece a la fecha en que empieza: "Noche 19:00–03:00" del sábado 5 termina
 * el domingo 6 a las 03:00 (CE-06). La franja OCUPADA suma la preparación
 * antes y después: [inicio − preparación, fin + preparación).
 */

const MS_MIN = 60 * 1000;

const minutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/** Un turno cuyo fin es menor o igual que su inicio termina al día siguiente. */
export const cruzaMedianoche = (horaInicio, horaFin) => minutos(horaFin) <= minutos(horaInicio);

/** Duración en horas de un turno (con medianoche). */
export function duracionHoras(horaInicio, horaFin) {
  const d = minutos(horaFin) - minutos(horaInicio);
  return (d <= 0 ? d + 24 * 60 : d) / 60;
}

/**
 * @param {string} fecha - "YYYY-MM-DD" (día en que empieza)
 * @param {string} horaInicio - "HH:mm"
 * @param {string} horaFin - "HH:mm" (menor o igual que inicio = día siguiente)
 * @param {number} [preparacionMin]
 * @returns {{ inicio: Date, fin: Date, ocupaInicio: Date, ocupaFin: Date }}
 */
export function franjaDe(fecha, horaInicio, horaFin, preparacionMin = 0) {
  const inicio = instanteLima(fecha, horaInicio);
  const fin = instanteLima(cruzaMedianoche(horaInicio, horaFin) ? sumarDias(fecha, 1) : fecha, horaFin);
  return conPreparacion(inicio, fin, preparacionMin);
}

/** Alquiler por horas: desde `horaInicio`, `horas` seguidas. */
export function franjaPorHoras(fecha, horaInicio, horas, preparacionMin = 0) {
  const inicio = instanteLima(fecha, horaInicio);
  return conPreparacion(inicio, new Date(inicio.getTime() + horas * 60 * MS_MIN), preparacionMin);
}

export function conPreparacion(inicio, fin, preparacionMin = 0) {
  return {
    inicio,
    fin,
    ocupaInicio: new Date(inicio.getTime() - preparacionMin * MS_MIN),
    ocupaFin: new Date(fin.getTime() + preparacionMin * MS_MIN)
  };
}

/** [a1, b1) y [a2, b2) se cruzan. */
export const seCruzan = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;

/** [a, b) cabe dentro de [desde, hasta]. */
export const instanteDentro = (a, b, desde, hasta) => a >= desde && b <= hasta;

/**
 * Hora tope municipal (R1.2, R11.4) para un evento que empieza en `fecha`:
 * una tope de madrugada ("03:00") es del día siguiente; una de la tarde o
 * noche ("23:00"), del mismo día.
 */
export function topeDe(fecha, horaTope) {
  return instanteLima(minutos(horaTope) < 12 * 60 ? sumarDias(fecha, 1) : fecha, horaTope);
}

/** 1 = lunes … 7 = domingo (como `dias_semana` de los turnos y los tours). */
export const diaIso = (fecha) => diaSemana(fecha) || 7;

// ---------- Precio por día (R2.6) ----------

/** Claves de precio: lunes a jueves, viernes, sábado, domingo y feriado. */
export const CLAVES_DIA = ["lj", "v", "s", "d", "f"];

/** Clave de precio de una fecha. Un feriado manda sobre el día de la semana. */
export function claveDia(fecha, feriados = FERIADOS) {
  if (esFeriado(fecha, feriados)) return "f";
  return { 5: "v", 6: "s", 0: "d" }[diaSemana(fecha)] ?? "lj";
}

/** Precio de una tabla `{ lj, v, s, d, f }`: una clave ausente cae en `lj`. */
export function precioDia(precios, clave) {
  const v = precios?.[clave] ?? precios?.lj;
  return v === undefined || v === null ? null : Number(v);
}

// ---------- Feriados nacionales del Perú (D4: precargados) ----------

/** Fijos, "MM-DD". Ley 31788 (7 de junio) y Ley 31408 (6 de agosto) incluidos. */
const FERIADOS_FIJOS = [
  "01-01", "05-01", "06-07", "06-29", "07-23", "07-28", "07-29",
  "08-06", "08-30", "10-08", "11-01", "12-08", "12-09", "12-25"
];

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher), "YYYY-MM-DD". */
export function domingoDePascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Jueves y Viernes Santo de un año. */
const semanaSanta = (anio) => {
  const pascua = domingoDePascua(anio);
  return [sumarDias(pascua, -3), sumarDias(pascua, -2)];
};

/** Por defecto: los feriados nacionales. Se puede pasar una lista "YYYY-MM-DD" propia. */
export const FERIADOS = null;

export function esFeriado(fecha, feriados = FERIADOS) {
  if (Array.isArray(feriados)) return feriados.includes(fecha);
  return FERIADOS_FIJOS.includes(fecha.slice(5)) || semanaSanta(Number(fecha.slice(0, 4))).includes(fecha);
}
