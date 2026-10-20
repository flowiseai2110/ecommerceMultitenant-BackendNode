// Calendario de campañas — lógica pura (sin BD ni reloj) para poder testearla.
//
// Todas las fechas se interpretan en hora de Lima. Perú no tiene horario de
// verano desde 1994: es UTC−5 fijo todo el año, así que basta un offset
// constante y no hace falta una librería de zonas horarias.
//
// Se trabaja con fechas "civiles" ({ anio, mes, dia }, mes 1-12) y solo al
// final se convierten a instantes (Date). La aritmética de días se hace con
// Date.UTC, que normaliza desbordes (31 de abril → 1 de mayo).

const OFFSET_LIMA_HORAS = 5;

/** Instante de las 00:00 de Lima de esa fecha civil (desplazada `dias`). */
export function inicioDiaLima({ anio, mes, dia }, dias = 0) {
  return new Date(Date.UTC(anio, mes - 1, dia + dias, OFFSET_LIMA_HORAS));
}

/** Fecha civil de Lima de un instante. */
export function fechaCivilLima(instante) {
  const d = new Date(instante.getTime() - OFFSET_LIMA_HORAS * 3_600_000);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** "YYYY-MM-DDTHH:mm:ss-05:00": lo que el storefront recibe (R3.3). */
export function aIsoLima(instante) {
  const d = new Date(instante.getTime() - OFFSET_LIMA_HORAS * 3_600_000);
  return d.toISOString().slice(0, 19) + "-05:00";
}

/** "YYYY-MM-DD" → fecha civil, o null si no es una fecha real. */
export function parsearFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? "");
  if (!m) return null;
  const civil = { anio: +m[1], mes: +m[2], dia: +m[3] };
  const vuelta = fechaCivilLima(inicioDiaLima(civil));
  // 2027-02-30 se normalizaría a marzo: no es una fecha válida.
  return vuelta.mes === civil.mes && vuelta.dia === civil.dia ? civil : null;
}

/**
 * Fecha clave de la regla en ese año (fecha civil).
 * - fija: { mes, dia }
 * - nEsimoDia: el n-ésimo `diaSemana` (0 = domingo) del mes, + `desfase` días.
 */
export function fechaClave(regla, anio) {
  if (regla.tipo === "fija") return { anio, mes: regla.mes, dia: regla.dia };

  const diaSemanaDel1 = new Date(Date.UTC(anio, regla.mes - 1, 1)).getUTCDay();
  const primero = 1 + ((regla.diaSemana - diaSemanaDel1 + 7) % 7);
  const d = new Date(Date.UTC(anio, regla.mes - 1, primero + (regla.n - 1) * 7 + (regla.desfase ?? 0)));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** "HH:mm" → milisegundos desde las 00:00 (null si no hay hora). */
export function horaAMs(hora) {
  if (!hora) return null;
  const [h, m] = hora.split(":");
  return (+h * 60 + +m) * 60_000;
}

/**
 * Ventanas [inicio, fin) de una campaña (R1.2, R3): una LISTA (hoy de 0 o 1;
 * la lista deja sitio a varias ediciones por año y a franjas semanales).
 *
 * Catálogo (con `regla`): desde `fechaClave − anticipacionDias` hasta el
 * día `fechaClave + despuesDias`. Propia: fechas explícitas `inicio`/`fin`
 * ("YYYY-MM-DD", ambas inclusive, sin repetición: `anio` se ignora).
 *
 * `horaInicio` vale para el primer día y `horaFin` para el último (R3.3);
 * sin hora, el inicio es a las 00:00 y el fin al terminar el día (R3.5).
 * `fechaClave` de una propia es el día que contiene `fin − 1 ms`: con fin a
 * las 00:00 es el día anterior (R3.14). Una ventana vacía se descarta.
 */
export function ventanas(campana, anio) {
  const horaInicio = horaAMs(campana.horaInicio) ?? 0;
  const horaFin = horaAMs(campana.horaFin);
  const finDe = (dia) =>
    horaFin === null ? inicioDiaLima(dia, 1) : new Date(inicioDiaLima(dia).getTime() + horaFin);

  let v;
  if (!campana.regla) {
    const inicio = parsearFecha(campana.inicio);
    const fin = parsearFecha(campana.fin);
    if (!inicio || !fin) return [];
    const finInstante = finDe(fin);
    v = {
      campana,
      inicio: new Date(inicioDiaLima(inicio).getTime() + horaInicio),
      fechaClave: inicioDiaLima(fechaCivilLima(new Date(finInstante.getTime() - 1))),
      fin: finInstante
    };
  } else {
    const clave = fechaClave(campana.regla, anio);
    const ultimo = { anio: clave.anio, mes: clave.mes, dia: clave.dia + (campana.despuesDias ?? 0) };
    v = {
      campana,
      inicio: new Date(inicioDiaLima(clave, -(campana.anticipacionDias ?? 0)).getTime() + horaInicio),
      fechaClave: inicioDiaLima(clave),
      fin: finDe(ultimo)
    };
  }
  return v.inicio < v.fin ? [v] : [];
}

/** La primera ventana de la campaña en ese año, o null (campañas de una sola ventana). */
export function ventana(campana, anio) {
  return ventanas(campana, anio)[0] ?? null;
}

/**
 * Ventana [inicio, fin) del efecto festivo dentro de la ventana `v` de su
 * campaña (docs/specs/efectos-festivos E2.2). En modo "campana" es la misma
 * ventana; en "clave", los `diasEfecto` (desplazamientos desde la fecha
 * clave) recortados a la campaña. Null si quedan fuera de ella.
 */
export function ventanaEfecto(campana, v) {
  if (!v) return null;
  if (campana.efectoModo === "campana") return { inicio: v.inicio, fin: v.fin };

  const dias = campana.diasEfecto?.length ? campana.diasEfecto : [0];
  const clave = fechaCivilLima(v.fechaClave);
  const inicio = new Date(Math.max(inicioDiaLima(clave, Math.min(...dias)), v.inicio));
  const fin = new Date(Math.min(inicioDiaLima(clave, Math.max(...dias) + 1), v.fin));
  return inicio < fin ? { inicio, fin } : null;
}

/**
 * Campaña vigente en `ahora` (o null). Si se cruzan varias, gana la de
 * mayor `prioridad` (default 1) y, a igual prioridad, la de ventana más
 * corta: la más específica (R1.3). Se revisan el año anterior y el
 * siguiente por ventanas que cruzan el cambio de año.
 */
export function vigente(campanas, ahora) {
  const { anio } = fechaCivilLima(ahora);
  let mejor = null;

  for (const campana of campanas) {
    const anios = campana.regla ? [anio - 1, anio, anio + 1] : [anio];
    for (const a of anios) {
      for (const v of ventanas(campana, a)) {
        if (ahora < v.inicio || ahora >= v.fin) continue;
        if (!mejor || gana(v, mejor)) mejor = v;
      }
    }
  }
  return mejor;
}

function gana(a, b) {
  const pa = a.campana.prioridad ?? 1;
  const pb = b.campana.prioridad ?? 1;
  if (pa !== pb) return pa > pb;
  return a.fin - a.inicio < b.fin - b.inicio;
}

/**
 * Ventana de la campaña en curso o la próxima (para el calendario del admin
 * y la vista previa). Null para una campaña propia que ya terminó.
 */
export function proximaVentana(campana, ahora) {
  const enCurso = vigente([campana], ahora);
  if (enCurso) return enCurso;

  if (!campana.regla) return ventanas(campana).find((v) => ahora < v.inicio) ?? null;

  const { anio } = fechaCivilLima(ahora);
  for (const a of [anio, anio + 1]) {
    const v = ventanas(campana, a).find((w) => ahora < w.inicio);
    if (v) return v;
  }
  return null;
}
