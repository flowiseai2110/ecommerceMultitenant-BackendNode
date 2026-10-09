import { fechaCorta, horasEntre, horaLima } from "../tiempo.js";
import { temporadaDe } from "../hotel/cotizar.js";
import { claveDia, diaIso, franjaDe, franjaPorHoras, instanteDentro, precioDia, topeDe } from "./franja.js";

/**
 * Cotización del alquiler de un salón (docs/specs/alquiler-locales R2, R4):
 * función pura (sin BD), como las de hotel, tours y eventos.
 *
 * Tres modalidades de paquete:
 *   - solo_local: precio del TURNO según el día (lj, v, s, d, f);
 *   - paquete: precio del PAQUETE según el día, fijo o por persona (con mínimo);
 *   - por_horas: precio por hora del salón × horas, dentro de su franja.
 * Las temporadas (`hotel_temporadas`) ajustan el precio base en %. La
 * disponibilidad NO se revisa aquí: la garantiza la BD al ocupar la franja.
 */

export const TIPOS_EVENTO = ["quinceanos", "promocion", "cumpleanos", "boda", "corporativo", "conferencia", "otro"];
export const MODALIDADES = ["solo_local", "paquete", "por_horas"];

const ETIQUETAS_EVENTO = {
  quinceanos: "Quinceaños", promocion: "Fiesta de promoción", cumpleanos: "Cumpleaños", boda: "Boda",
  corporativo: "Evento corporativo", conferencia: "Conferencia", otro: "Otro evento"
};
export const etiquetaTipoEvento = (tipo) => ETIQUETAS_EVENTO[tipo] ?? tipo;

const ETIQUETAS_DIA = { lj: "lunes a jueves", v: "viernes", s: "sábado", d: "domingo", f: "feriado" };

const redondear = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === null || v === undefined ? null : Number(v));
const error = (codigo, mensaje, campo = null) => ({ codigo, mensaje, campo });

/**
 * Separación (adelanto) que fija la fecha (R1.2): un % del total o un monto
 * fijo, nunca mayor que el total.
 */
export function separacionDe(total, config) {
  if (total <= 0) return 0;
  if (config.separacionTipo === "monto_fijo" && config.separacionMonto) return redondear(Math.min(Number(config.separacionMonto), total));
  const pct = config.adelantoPct ?? 100;
  return redondear(total * pct / 100);
}

/** El paquete se ofrece en ese turno (lista vacía = todos). */
export const paqueteEnTurno = (paquete, turnoId) => !paquete.turnoIds?.length || paquete.turnoIds.includes(turnoId);

/** El paquete se ofrece para ese tipo de evento (lista vacía = todos). */
export const paqueteParaEvento = (paquete, tipoEvento) => !paquete.tiposEvento?.length || paquete.tiposEvento.includes(tipoEvento);

/**
 * @param {object} p
 * @param {object} p.salon - local_salones (+ nombre del producto)
 * @param {Array} p.turnos - turnos del salón
 * @param {object|null} p.paquete - paquete elegido
 * @param {string|null} p.turnoId
 * @param {string} p.fecha - "YYYY-MM-DD"
 * @param {string|null} p.horaInicio - por horas
 * @param {number|null} p.horas - por horas
 * @param {number} p.invitados
 * @param {string} p.tipoEvento
 * @param {boolean} [p.proveedoresExternos] - el cliente traerá proveedores propios
 * @param {Array} [p.temporadas] - "YYYY-MM-DD" (temporadasParaEstadia)
 * @param {Array} [p.cierres] - [{ fechaDesde, fechaHasta }]
 * @param {Array|null} [p.feriados] - null = feriados nacionales
 * @param {object} p.config - configuración de reservas resuelta
 * @param {Date} [p.ahora]
 */
export function cotizarLocal({
  salon, turnos = [], paquete, turnoId = null, fecha, horaInicio = null, horas = null, invitados, tipoEvento,
  proveedoresExternos = false, temporadas = [], cierres = [], feriados = null, config, ahora = new Date()
}) {
  const errores = [];
  const lineas = [];
  const clave = claveDia(fecha, feriados);
  const temporada = temporadaDe(fecha, temporadas);
  const ajustar = (precio) => (temporada ? redondear(precio * (1 + temporada.ajustePct / 100)) : precio);
  const cuando = `${ETIQUETAS_DIA[clave]} ${fechaCorta(fecha)}${temporada ? ` · ${temporada.nombre}` : ""}`;

  if (!TIPOS_EVENTO.includes(tipoEvento)) errores.push(error("TIPO_EVENTO_INVALIDO", "Elige el tipo de evento", "tipoEvento"));

  // Aforo de la licencia (R2.2, CE-08): ninguna cotización lo supera.
  if (!invitados || invitados < 1) {
    errores.push(error("INVITADOS_REQUERIDOS", "Indica el número de invitados", "invitados"));
  } else if (invitados > salon.aforoMaximo) {
    errores.push(error("AFORO_EXCEDIDO", `El aforo máximo del local es de ${salon.aforoMaximo} personas`, "invitados"));
  }

  let franja = null;
  let turno = null;
  let horaFin = null;
  let base = null;

  if (!paquete || !paquete.activo) {
    errores.push(error("PAQUETE_INVALIDO", "Ese paquete ya no está disponible. Actualiza la página", "paqueteId"));
  } else if (paquete.modalidad === "por_horas") {
    ({ franja, base, horaFin } = cotizarPorHoras({ salon, fecha, horaInicio, horas, config, errores }));
    if (base !== null) {
      const precioHora = ajustar(num(salon.precioHora));
      lineas.push({ descripcion: `Alquiler por horas · ${horas} h · ${cuando}`, cantidad: horas, precioUnitario: precioHora, total: redondear(precioHora * horas) });
    }
  } else {
    turno = turnos.find(t => t.id === turnoId) ?? null;
    if (!turno || !turno.activo) {
      errores.push(error("TURNO_INVALIDO", "Elige un turno", "turnoId"));
    } else {
      horaInicio = turno.horaInicio;
      horaFin = turno.horaFin;
      franja = franjaDe(fecha, turno.horaInicio, turno.horaFin, salon.preparacionMin);
      if (!turno.diasSemana.includes(diaIso(fecha))) {
        errores.push(error("TURNO_NO_OFRECIDO", `El turno ${turno.nombre} no se ofrece ese día`, "turnoId"));
      }
      if (!paqueteEnTurno(paquete, turno.id)) {
        errores.push(error("PAQUETE_NO_OFRECIDO", `"${paquete.nombre}" no se ofrece en el turno ${turno.nombre}`, "paqueteId"));
      }
      lineas.push(...lineasTurno({ paquete, turno, clave, invitados, cuando, ajustar, errores }));
    }
  }

  if (paquete && !paqueteParaEvento(paquete, tipoEvento)) {
    errores.push(error("PAQUETE_NO_OFRECIDO", `"${paquete.nombre}" no se ofrece para ${etiquetaTipoEvento(tipoEvento).toLowerCase()}`, "paqueteId"));
  }

  // Proveedores externos (R1.2): permitido o no, con tarifa de coordinación.
  if (proveedoresExternos) {
    if (!config.proveedoresExternos) {
      errores.push(error("PROVEEDORES_NO_PERMITIDOS", "Este local no permite proveedores externos", "proveedoresExternos"));
    } else if (config.tarifaCoordinacion) {
      const tarifa = Number(config.tarifaCoordinacion);
      lineas.push({ descripcion: "Coordinación de proveedores externos", cantidad: 1, precioUnitario: tarifa, total: tarifa });
    }
  }

  if (franja) {
    if (franja.inicio <= ahora) {
      errores.push(error("FECHA_PASADA", "Esa fecha ya pasó", "fecha"));
    } else if (config.anticipacionMinHoras && horasEntre(ahora, franja.inicio) < config.anticipacionMinHoras) {
      errores.push(error("ANTICIPACION", `Se reserva con al menos ${config.anticipacionMinHoras} horas de anticipación`, "fecha"));
    }
    if (cierres.some(c => c.fechaDesde <= fecha && fecha <= c.fechaHasta)) {
      errores.push(error("FECHA_CERRADA", "El local no recibe eventos esa fecha", "fecha"));
    }
  }

  const total = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const separacion = separacionDe(total, config);
  const garantia = num(config.garantiaMonto) ?? 0;

  return {
    inicio: franja?.inicio ?? null,
    fin: franja?.fin ?? null,
    ocupaInicio: franja?.ocupaInicio ?? null,
    ocupaFin: franja?.ocupaFin ?? null,
    fecha,
    horaInicio,
    horaFin,
    horas: paquete?.modalidad === "por_horas" ? horas : null,
    personas: invitados,
    lineas,
    total,
    separacion,
    garantia,
    errores,
    // Lo que la reserva y la cotización guardan (precio congelado, CE-07).
    snapshot: {
      salon: { productoId: salon.productoId, nombre: salon.nombre ?? null, aforoMaximo: salon.aforoMaximo, preparacionMin: salon.preparacionMin },
      turno: turno ? { id: turno.id, nombre: turno.nombre, horaInicio: turno.horaInicio, horaFin: turno.horaFin } : null,
      paquete: paquete ? {
        id: paquete.id, nombre: paquete.nombre, modalidad: paquete.modalidad, precioTipo: paquete.precioTipo,
        incluye: paquete.incluye ?? [], horasIncluidas: paquete.horasIncluidas ?? null, horaExtraPrecio: num(paquete.horaExtraPrecio),
        esPromocion: paquete.esPromocion ?? false
      } : null,
      tipoEvento,
      claveDia: clave,
      temporada: temporada ? { nombre: temporada.nombre, ajustePct: temporada.ajustePct } : null,
      separacion: { tipo: config.separacionTipo, pct: config.adelantoPct ?? null, monto: separacion },
      garantia,
      tramos: config.politicaTramos ?? null,
      tarifas: {
        coordinacion: num(config.tarifaCoordinacion),
        descorche: num(config.descorcheBotella),
        horaTope: config.horaTope
      }
    }
  };
}

function lineasTurno({ paquete, turno, clave, invitados, cuando, ajustar, errores }) {
  if (paquete.modalidad === "solo_local") {
    const precio = precioDia(turno.precios, clave);
    if (precio === null) {
      errores.push(error("PRECIO_NO_CONFIGURADO", `El turno ${turno.nombre} no tiene precio para ese día`, "turnoId"));
      return [];
    }
    const p = ajustar(precio);
    return [{ descripcion: `Alquiler del local · ${turno.nombre} · ${cuando}`, cantidad: 1, precioUnitario: p, total: p }];
  }

  const precio = precioDia(paquete.precios, clave);
  if (precio === null) {
    errores.push(error("PRECIO_NO_CONFIGURADO", `"${paquete.nombre}" no tiene precio para ese día`, "paqueteId"));
    return [];
  }
  const p = ajustar(precio);
  if (paquete.precioTipo !== "por_persona") {
    return [{ descripcion: `${paquete.nombre} · ${turno.nombre} · ${cuando}`, cantidad: 1, precioUnitario: p, total: p }];
  }
  if (paquete.maxPersonas && invitados > paquete.maxPersonas) {
    errores.push(error("PAQUETE_MAX_PERSONAS", `"${paquete.nombre}" es para hasta ${paquete.maxPersonas} personas`, "invitados"));
  }
  // Por debajo del mínimo se cobra el mínimo (R2.5).
  const cobradas = Math.max(invitados, paquete.minPersonas ?? 1);
  const minimo = cobradas > invitados ? ` (mínimo ${cobradas} personas)` : "";
  return [{
    descripcion: `${paquete.nombre} · ${turno.nombre} · ${cuando} · ${cobradas} personas${minimo}`,
    cantidad: cobradas, precioUnitario: p, total: redondear(p * cobradas)
  }];
}

function cotizarPorHoras({ salon, fecha, horaInicio, horas, config, errores }) {
  if (!salon.porHoras || !num(salon.precioHora)) {
    errores.push(error("POR_HORAS_NO_DISPONIBLE", "Este salón no se alquila por horas", "paqueteId"));
    return { franja: null, base: null, horaFin: null };
  }
  if (!horaInicio) {
    errores.push(error("HORA_REQUERIDA", "Indica la hora de inicio", "horaInicio"));
    return { franja: null, base: null, horaFin: null };
  }
  if (!horas || horas < (salon.minHoras ?? 1)) {
    errores.push(error("MIN_HORAS", `El mínimo es de ${salon.minHoras ?? 1} horas`, "horas"));
    return { franja: null, base: null, horaFin: null };
  }
  const franja = franjaPorHoras(fecha, horaInicio, horas, salon.preparacionMin);
  const horaFin = horaLima(franja.fin);
  // Dentro de la franja en que el salón se alquila por horas.
  if (salon.horasDesde && salon.horasHasta) {
    const ventana = franjaDe(fecha, salon.horasDesde, salon.horasHasta);
    if (!instanteDentro(franja.inicio, franja.fin, ventana.inicio, ventana.fin)) {
      errores.push(error("FUERA_DE_HORARIO", `Por horas se alquila de ${salon.horasDesde} a ${salon.horasHasta}`, "horaInicio"));
    }
  }
  // Hora tope municipal (R1.2).
  if (config.horaTope && franja.fin > topeDe(fecha, config.horaTope)) {
    errores.push(error("HORA_TOPE_EXCEDIDA", `Los eventos terminan como máximo a las ${config.horaTope}`, "horas"));
  }
  return { franja, base: num(salon.precioHora), horaFin };
}
