import { fechaLima, instanteLima, rangoFechas, sumarDias, diaSemana } from "../reservas/tiempo.js";

/**
 * Periodo del dashboard (docs/specs/dashboard-por-rubro, decisión 1): los
 * últimos 30 días de calendario de Lima, hoy incluido, y los 30 anteriores
 * para comparar.
 */
export const DIAS = 30;

export function ultimos30(ahora) {
  const hoy = fechaLima(ahora);
  const primerDia = sumarDias(hoy, -(DIAS - 1));
  return {
    hoy,
    dias: DIAS,
    fechas: rangoFechas(primerDia, hoy),
    desde: instanteLima(primerDia),
    hasta: ahora,
    anteriorDesde: instanteLima(sumarDias(primerDia, -DIAS))
  };
}

/** Mide lo mismo en el periodo y en el anterior: { valor, anterior }. */
export async function conAnterior(periodo, medir) {
  const [valor, anterior] = await Promise.all([
    medir(periodo.desde, periodo.hasta),
    medir(periodo.anteriorDesde, periodo.desde)
  ]);
  return { valor, anterior };
}

/**
 * Suma un mapa fecha → valor (de los 60 días) en { valor, anterior }.
 * Las fechas del periodo son las de `periodo.fechas`; lo previo es el anterior.
 */
export function sumarPorPeriodo(periodo, porFecha) {
  const primerDia = periodo.fechas[0];
  let valor = 0, anterior = 0;
  for (const [fecha, v] of porFecha) {
    if (fecha >= primerDia) valor += v;
    else anterior += v;
  }
  return { valor, anterior };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "2026-10-12" → "12 oct". */
export const etiquetaDia = (fecha) => `${Number(fecha.slice(8, 10))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`;

/** "2026-10-12" → "lun 12". */
export const etiquetaDiaSemana = (fecha) => `${DIAS_SEMANA[diaSemana(fecha)]} ${Number(fecha.slice(8, 10))}`;

/** Serie de barras de los 30 días del periodo (0 donde no hay datos). */
export const serieDelPeriodo = (periodo, porFecha) =>
  periodo.fechas.map((f) => ({ etiqueta: etiquetaDia(f), valor: porFecha.get(f) ?? 0 }));

/** Fechas de hoy a hoy + n − 1. */
export const proximosDias = (periodo, n) => rangoFechas(periodo.hoy, sumarDias(periodo.hoy, n - 1));
