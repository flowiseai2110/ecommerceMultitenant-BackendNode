/**
 * Fechas y horas de reservas en hora de Lima.
 *
 * Perú tiene una sola zona horaria y no usa horario de verano: siempre -05:00.
 * Una fecha de calendario se maneja como texto "YYYY-MM-DD" (sin zona) y un
 * instante como Date. Mismo criterio que modules/libro-reclamaciones/plazos.js.
 */

const OFFSET = "-05:00";
const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esFecha = (v) => typeof v === "string" && FECHA_RE.test(v);
export const esHora = (v) => typeof v === "string" && HORA_RE.test(v);

/** "2026-09-24" + "18:30" → instante de Lima. */
export function instanteLima(fecha, hora = "00:00") {
  return new Date(`${fecha}T${hora}:00${OFFSET}`);
}

/** Instante → "YYYY-MM-DD" en Lima. */
export function fechaLima(instante) {
  return new Date(instante.getTime() - 5 * MS_HORA).toISOString().slice(0, 10);
}

/** Instante → "HH:mm" en Lima. */
export function horaLima(instante) {
  return new Date(instante.getTime() - 5 * MS_HORA).toISOString().slice(11, 16);
}

/** "2026-09-24" + 2 → "2026-09-26". */
export function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado, del día del calendario. */
export function diaSemana(fecha) {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

/** "2026-09-24" → "24/09". */
export function fechaCorta(fecha) {
  const [, m, d] = fecha.split("-");
  return `${d}/${m}`;
}

/** Fechas del calendario desde `desde` hasta `hasta` inclusive. */
export function rangoFechas(desde, hasta) {
  const fechas = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) fechas.push(f);
  return fechas;
}

export const horasEntre = (a, b) => (b.getTime() - a.getTime()) / MS_HORA;
export const sumarHoras = (instante, horas) => new Date(instante.getTime() + horas * MS_HORA);
