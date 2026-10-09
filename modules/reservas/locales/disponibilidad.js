import { rangoFechas, sumarDias } from "../tiempo.js";
import { diaIso, franjaDe, franjaPorHoras, seCruzan } from "./franja.js";

/**
 * Disponibilidad de un salón a partir de sus ocupaciones vigentes
 * (docs/specs/alquiler-locales R3). Funciones puras para el calendario y para
 * las alternativas del 409 FECHA_NO_DISPONIBLE. NO deciden si se puede
 * reservar: eso lo decide la restricción de exclusión al ocupar (R3.5).
 *
 * `ocupadas`: filas vigentes de local_ocupaciones del salón ({ inicio, fin },
 * ya con la preparación incluida).
 */

const cerrada = (fecha, cierres) => cierres.some(c => c.fechaDesde <= fecha && fecha <= c.fechaHasta);

/** La franja ocupada de un turno en una fecha choca con alguna ocupación. */
const chocaTurno = (fecha, turno, salon, ocupadas) => {
  const f = franjaDe(fecha, turno.horaInicio, turno.horaFin, salon.preparacionMin);
  return ocupadas.some(o => seCruzan(f.ocupaInicio, f.ocupaFin, new Date(o.inicio), new Date(o.fin)));
};

/** Turnos activos que se ofrecen ese día de la semana. */
export const turnosDelDia = (fecha, turnos) =>
  turnos.filter(t => t.activo && t.diasSemana.includes(diaIso(fecha)))
    .sort((a, b) => a.orden - b.orden || a.horaInicio.localeCompare(b.horaInicio));

/**
 * Estado de una fecha del calendario (R3.1): libre, parcial (queda algún
 * turno), ocupada o cerrada. Un turno que ya empezó no está libre.
 * @returns {{ fecha: string, estado: string, turnos: Array<{ id: string, nombre: string, libre: boolean }> }}
 */
export function estadoFecha({ fecha, salon, turnos, ocupadas, cierres = [], ahora = new Date() }) {
  const delDia = turnosDelDia(fecha, turnos);
  if (cerrada(fecha, cierres)) return { fecha, estado: "cerrada", turnos: [] };
  const estados = delDia.map(t => {
    const f = franjaDe(fecha, t.horaInicio, t.horaFin, salon.preparacionMin);
    return { id: t.id, nombre: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin, libre: f.inicio > ahora && !chocaTurno(fecha, t, salon, ocupadas) };
  });
  const libres = estados.filter(t => t.libre).length;
  // Sin turnos ese día (o salón solo por horas): libre si nada lo ocupa.
  if (!estados.length) {
    const diaEntero = franjaDe(fecha, "00:00", "00:00");
    const ocupado = ocupadas.some(o => seCruzan(diaEntero.inicio, diaEntero.fin, new Date(o.inicio), new Date(o.fin)));
    return { fecha, estado: diaEntero.fin <= ahora ? "ocupada" : ocupado ? "parcial" : "libre", turnos: [] };
  }
  const estado = libres === estados.length ? "libre" : libres === 0 ? "ocupada" : "parcial";
  return { fecha, estado, turnos: estados };
}

/** Calendario de un rango (R3.1, R12.2). */
export function calendario({ desde, hasta, salon, turnos, ocupadas, cierres = [], ahora = new Date() }) {
  return rangoFechas(desde, hasta).map(fecha => estadoFecha({ fecha, salon, turnos, ocupadas, cierres, ahora }));
}

/** 0, +1, −1, +2, −2… hasta `dias`. */
function* cercanas(fecha, dias) {
  yield fecha;
  for (let d = 1; d <= dias; d++) {
    yield sumarDias(fecha, d);
    yield sumarDias(fecha, -d);
  }
}

/**
 * Hasta `max` franjas libres cercanas a la pedida (R3.4): primero otros
 * turnos del mismo día, luego los días más cercanos.
 * @param {object} p
 * @param {string[]} [p.turnoIds] - turnos en que se ofrece el paquete (vacío = todos)
 * @param {{ horaInicio: string, horas: number }|null} [p.porHoras] - alquiler por horas: misma hora en otros días
 */
export function alternativas({
  fecha, salon, turnos = [], ocupadas, cierres = [], ahora = new Date(), turnoIds = [], porHoras = null, max = 3, dias = 14
}) {
  const resultado = [];
  for (const f of cercanas(fecha, dias)) {
    if (resultado.length >= max) break;
    if (cerrada(f, cierres)) continue;
    if (porHoras) {
      const franja = franjaPorHoras(f, porHoras.horaInicio, porHoras.horas, salon.preparacionMin);
      if (franja.inicio > ahora && !ocupadas.some(o => seCruzan(franja.ocupaInicio, franja.ocupaFin, new Date(o.inicio), new Date(o.fin)))) {
        resultado.push({ fecha: f, turnoId: null, turno: null, horaInicio: porHoras.horaInicio, horas: porHoras.horas });
      }
      continue;
    }
    for (const t of turnosDelDia(f, turnos)) {
      if (resultado.length >= max) break;
      if (turnoIds.length && !turnoIds.includes(t.id)) continue;
      const franja = franjaDe(f, t.horaInicio, t.horaFin, salon.preparacionMin);
      if (franja.inicio > ahora && !chocaTurno(f, t, salon, ocupadas)) {
        resultado.push({ fecha: f, turnoId: t.id, turno: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin });
      }
    }
  }
  return resultado;
}
