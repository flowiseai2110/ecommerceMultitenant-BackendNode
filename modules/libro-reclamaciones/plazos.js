import { logger } from "../../config/logger.js";

/**
 * Plazo de respuesta del Libro de Reclamaciones: 15 días hábiles improrrogables
 * (DS 101-2022-PCM). Hábil = lunes a viernes que no es feriado nacional.
 *
 * Todas las fechas son strings "YYYY-MM-DD" en hora de Lima: una hoja
 * registrada a las 21:00 en Lima (02:00 UTC del día siguiente) es del día de
 * Lima. La aritmética se hace en UTC para no depender de la zona del servidor.
 */

export const PLAZO_DIAS_HABILES = 15;
// Con 5 o menos días hábiles restantes el semáforo pasa a ámbar.
export const UMBRAL_POR_VENCER = 5;

const ZONA = "America/Lima";

// Feriados nacionales (16 en 2026). Revisar cada diciembre contra gob.pe: el
// Congreso agrega feriados. Los "días no laborables" del sector público NO van
// acá (son hábiles para este plazo). Si falta un año, el plazo sale un día
// antes de lo real en el peor caso: la tienda responde antes, nunca después.
export const FERIADOS = {
  2026: [
    "2026-01-01", "2026-04-02", "2026-04-03", "2026-05-01", "2026-06-07", "2026-06-29",
    "2026-07-23", "2026-07-28", "2026-07-29", "2026-08-06", "2026-08-30", "2026-10-08",
    "2026-11-01", "2026-12-08", "2026-12-09", "2026-12-25"
  ],
  2027: [
    "2027-01-01", "2027-03-25", "2027-03-26", "2027-05-01", "2027-06-07", "2027-06-29",
    "2027-07-23", "2027-07-28", "2027-07-29", "2027-08-06", "2027-08-30", "2027-10-08",
    "2027-11-01", "2027-12-08", "2027-12-09", "2027-12-25"
  ]
};

const conjuntos = new Map();
const aniosAvisados = new Set();

function feriadosDelAnio(anio, feriados) {
  const lista = feriados[anio];
  if (!lista) {
    if (feriados === FERIADOS && !aniosAvisados.has(anio)) {
      aniosAvisados.add(anio);
      logger.warn(`⚠️ Libro de Reclamaciones: no hay feriados cargados para ${anio}; el plazo solo descuenta fines de semana`);
    }
    return null;
  }
  if (feriados !== FERIADOS) return new Set(lista);
  if (!conjuntos.has(anio)) conjuntos.set(anio, new Set(lista));
  return conjuntos.get(anio);
}

const aUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const aISO = (fecha) => fecha.toISOString().slice(0, 10);
const sumarDias = (iso, n) => {
  const f = aUTC(iso);
  f.setUTCDate(f.getUTCDate() + n);
  return aISO(f);
};

/**
 * Fecha de hoy (o de `now`) en Lima.
 * @param {Date} [now]
 * @returns {string} "YYYY-MM-DD"
 */
export function hoyLima(now = new Date()) {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
}

/**
 * @param {string} iso - "YYYY-MM-DD"
 * @param {Record<number, string[]>} [feriados]
 */
export function esDiaHabil(iso, feriados = FERIADOS) {
  const dia = aUTC(iso).getUTCDay();
  if (dia === 0 || dia === 6) return false;
  const delAnio = feriadosDelAnio(Number(iso.slice(0, 4)), feriados);
  return !delAnio?.has(iso);
}

/**
 * Día hábil número `n` contando desde el día SIGUIENTE a `iso`.
 * @returns {string} "YYYY-MM-DD"
 */
export function sumarDiasHabiles(iso, n, feriados = FERIADOS) {
  let fecha = iso;
  let contados = 0;
  while (contados < n) {
    fecha = sumarDias(fecha, 1);
    if (esDiaHabil(fecha, feriados)) contados++;
  }
  return fecha;
}

/**
 * Días hábiles que quedan hasta la fecha límite, contando esta. 0 = vence hoy
 * (o hoy no es hábil y vence el próximo); negativo = vencida.
 */
export function diasHabilesRestantes(fechaLimite, hoy, feriados = FERIADOS) {
  if (fechaLimite === hoy) return 0;
  if (fechaLimite < hoy) {
    let dias = 0;
    for (let f = fechaLimite; f < hoy; f = sumarDias(f, 1)) {
      if (esDiaHabil(sumarDias(f, 1), feriados)) dias--;
    }
    return Math.min(dias, -1);
  }
  let dias = 0;
  for (let f = hoy; f < fechaLimite; f = sumarDias(f, 1)) {
    if (esDiaHabil(sumarDias(f, 1), feriados)) dias++;
  }
  return dias;
}

/** Fecha límite de una hoja registrada en `fechaRegistro` (Date). */
export function calcularFechaLimite(fechaRegistro = new Date(), feriados = FERIADOS) {
  return sumarDiasHabiles(hoyLima(fechaRegistro), PLAZO_DIAS_HABILES, feriados);
}

/**
 * verde: > 5 días hábiles · ambar: 1–5 · rojo: vence hoy o vencida · null: respondida.
 * @param {{ estado: string, fechaLimite: string }} hoja - fechaLimite en ISO.
 */
export function semaforo(hoja, hoy = hoyLima(), feriados = FERIADOS) {
  if (hoja.estado === "respondida") return null;
  const restantes = diasHabilesRestantes(hoja.fechaLimite, hoy, feriados);
  if (restantes <= 0) return "rojo";
  return restantes <= UMBRAL_POR_VENCER ? "ambar" : "verde";
}

/** "YYYY-MM-DD" de un campo @db.Date que Prisma devuelve como Date a medianoche UTC. */
export function fechaISO(valor) {
  if (!valor) return null;
  return typeof valor === "string" ? valor.slice(0, 10) : aISO(valor);
}

/** Inverso de fechaISO: para escribir/filtrar un @db.Date con Prisma. */
export const fechaDate = (iso) => aUTC(iso);
