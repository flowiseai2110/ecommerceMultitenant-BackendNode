import {
  diaSemana, fechaCorta, fechaLima, horaLima, horasEntre, instanteLima, rangoFechas, sumarDias, sumarHoras
} from "../tiempo.js";
import { textosCotizar } from "./textos-cotizar.js";

/**
 * Cotización de una solicitud de hotel / hostal: función pura (sin BD), como
 * envios/cotizacion.js. La usan la vitrina (/cotizar), la creación de la
 * solicitud y el asesor IA, así nunca muestran precios distintos.
 *
 * Modalidades (spec R2.2):
 *   - noche: precio por noche, opcionalmente distinto viernes y sábado;
 *   - horas: bloque de N horas con precio fijo ("fracción 6 h"). Ventana fija:
 *     la salida es ingreso + N horas aunque el cliente llegue tarde (R2.3.1).
 * Si el tipo es "por persona" (cama en dormitorio) el precio se multiplica.
 *
 * Además (docs/specs/hospedaje-completo, fase B):
 *   - temporadas: ajuste % sobre el precio de cada noche y mínimo de noches
 *     si la llegada cae en una;
 *   - cargo por niño mayor a la edad gratuita, por noche;
 *   - extras (traslado, early check-in…) cobrados por estadía, noche, persona
 *     o persona y noche;
 *   - exoneración del IGV al turista extranjero (sobre el alojamiento).
 *
 * Y (fase C): varias habitaciones del mismo tipo, cupo según el inventario y
 * plan de tarifa (no reembolsable con descuento).
 */

export const MAX_HABITACIONES = 10;

export const MAX_NOCHES = 30;
export const MAX_DIAS_ADELANTE = 365;

const redondear = (n) => Math.round(n * 100) / 100;

/** Viernes o sábado: las noches que suelen costar más. */
const esVieSab = (fecha) => [5, 6].includes(diaSemana(fecha));

/**
 * Ventana de la estadía.
 * @returns {{ inicio: Date, fin: Date, fechas: string[] }} fechas = días del calendario ocupados
 */
export function ventanaEstadia({ modalidad, fecha, hora, noches, horaCheckin, horaCheckout }) {
  if (modalidad.tipo === "horas") {
    const inicio = instanteLima(fecha, hora);
    const fin = sumarHoras(inicio, modalidad.horas);
    // Un bloque de 18:30 a 00:30 toca dos fechas: las dos deben estar abiertas.
    const ultimoDia = fechaLima(new Date(fin.getTime() - 1));
    return { inicio, fin, fechas: rangoFechas(fecha, ultimoDia) };
  }
  const salida = sumarDias(fecha, noches);
  return {
    inicio: instanteLima(fecha, hora || horaCheckin),
    fin: instanteLima(salida, horaCheckout),
    fechas: rangoFechas(fecha, sumarDias(fecha, noches - 1))
  };
}

/** IGV peruano: los precios publicados lo incluyen. */
export const IGV = 0.18;

/**
 * Temporada que rige una noche: la de mayor ajuste entre las que la contienen
 * (si un feriado cae dentro de una temporada alta, gana el más caro).
 * @param {string} fecha - "YYYY-MM-DD"
 * @param {Array<{ nombre: string, desde: string, hasta: string, ajustePct: number, minNoches?: number|null }>} temporadas
 */
export function temporadaDe(fecha, temporadas) {
  let elegida = null;
  for (const t of temporadas) {
    if (t.desde <= fecha && fecha <= t.hasta && (!elegida || t.ajustePct > elegida.ajustePct)) elegida = t;
  }
  return elegida;
}

/**
 * Líneas de precio. Las noches se agrupan por precio (y temporada) para que
 * el detalle sea corto ("3 noches × S/ 160") sin perder qué noches son.
 */
export function lineasPrecio({ modalidad, personas, fechas, porPersona, temporadas = [], habitaciones = 1, t = textosCotizar("es") }) {
  const factor = porPersona ? personas : habitaciones;
  const sufijo = porPersona ? t.personas(personas) : habitaciones > 1 ? t.habitaciones(habitaciones) : "";

  if (modalidad.tipo === "horas") {
    const precio = Number(modalidad.precio);
    return [{
      descripcion: `${t.estadiaHoras(modalidad.horas)}${sufijo}`,
      cantidad: factor,
      precioUnitario: precio,
      total: redondear(precio * factor)
    }];
  }

  const grupos = new Map();
  for (const f of fechas) {
    const base = esVieSab(f) && modalidad.precioVieSab != null ? Number(modalidad.precioVieSab) : Number(modalidad.precio);
    const temporada = temporadaDe(f, temporadas);
    const precio = temporada ? redondear(base * (1 + temporada.ajustePct / 100)) : base;
    const clave = `${precio}|${temporada?.nombre ?? ""}`;
    if (!grupos.has(clave)) grupos.set(clave, { precio, temporada: temporada?.nombre ?? null, dias: [] });
    grupos.get(clave).dias.push(f);
  }
  return [...grupos.values()].map(({ precio, temporada, dias }) => {
    const cantidad = dias.length * factor;
    const detalle = dias.map(d => `${t.dias[diaSemana(d)]} ${(t.fecha ?? fechaCorta)(d)}`).join(", ");
    return {
      descripcion: `${t.noches(dias.length)}${temporada ? ` ${temporada}` : ""} (${detalle})${sufijo}`,
      cantidad,
      precioUnitario: precio,
      total: redondear(precio * cantidad)
    };
  });
}

/**
 * Cargo por niño (B4): los mayores a `ninosGratisHasta` pagan `cargoNinoNoche`
 * por noche (un bloque por horas cuenta como una). No aplica a camas por persona:
 * ahí cada niño ya paga su cama.
 */
export function lineaNinos({ edadesNinos, noches, esHoras, porPersona, config, t = textosCotizar("es") }) {
  if (porPersona || config.ninosGratisHasta == null || !config.cargoNinoNoche) return null;
  const pagan = edadesNinos.filter(e => e > config.ninosGratisHasta).length;
  if (!pagan) return null;
  const veces = esHoras ? 1 : noches;
  const precio = Number(config.cargoNinoNoche);
  return {
    descripcion: t.ninos(pagan, config.ninosGratisHasta, veces, esHoras),
    cantidad: pagan * veces,
    precioUnitario: precio,
    total: redondear(precio * pagan * veces)
  };
}

/** Unidades de un extra según cómo se cobra. */
export function cantidadExtra(cobro, { noches, personas, esHoras, cantidad = 1 }) {
  const n = esHoras ? 1 : noches;
  if (cobro === "noche") return n;
  if (cobro === "persona") return personas;
  if (cobro === "persona_noche") return personas * n;
  return cantidad; // por estadía: lo que pide el huésped (un traslado de ida, ida y vuelta…)
}

/**
 * Extras elegidos (B3) → líneas y la copia que guarda la reserva.
 * @param {Array} catalogo - hotel_extras activos de la tienda
 * @param {Array<{ extraId: string, cantidad?: number, dato?: string|null }>} elegidos
 */
export function lineasExtras({ catalogo, elegidos, noches, personas, esHoras, t = textosCotizar("es") }) {
  const lineas = [];
  const snapshot = [];
  const errores = [];
  for (const el of elegidos) {
    const extra = catalogo.find(x => x.id === el.extraId);
    if (!extra || !extra.activo) {
      errores.push(error("EXTRA_INVALIDO", t.err.extraInvalido, "extras"));
      continue;
    }
    const precio = Number(extra.precio);
    const cantidad = cantidadExtra(extra.cobro, { noches, personas, esHoras, cantidad: el.cantidad ?? 1 });
    const total = redondear(precio * cantidad);
    const unidad = t.unidadExtra[extra.cobro] ?? "";
    lineas.push({ descripcion: `${extra.nombre}${cantidad > 1 ? ` × ${cantidad}` : ""}${unidad ? ` (${unidad})` : ""}`, cantidad, precioUnitario: precio, total });
    snapshot.push({ id: extra.id, nombre: extra.nombre, cobro: extra.cobro, precio, cantidad, total, datoPedido: extra.datoPedido ?? null, dato: el.dato ?? null });
  }
  return { lineas, snapshot, errores };
}

/**
 * Exoneración del IGV al turista extranjero (B5): los precios incluyen IGV y
 * el extranjero paga el alojamiento sin él. Los extras no se exoneran.
 * @returns {number} monto a descontar (positivo)
 */
export function descuentoIgv(montoAlojamiento) {
  return redondear(montoAlojamiento - montoAlojamiento / (1 + IGV));
}

/** Cuánto se paga al reservar según el cobro configurado. */
export function montoACuenta(total, { cobro, adelantoPct }) {
  if (cobro === "en_destino") return 0;
  if (cobro === "adelanto" && adelantoPct) return redondear(total * adelantoPct / 100);
  return total;
}

/** Texto del aviso de reserva próxima con {hora} resuelto. */
export function textoAviso(plantilla, inicio, ahora) {
  const hora = horaLima(inicio);
  const etiqueta = fechaLima(inicio) === fechaLima(ahora) ? hora : `${hora} del ${fechaCorta(fechaLima(inicio))}`;
  return plantilla.replaceAll("{hora}", etiqueta);
}

const error = (codigo, mensaje, campo = null) => ({ codigo, mensaje, campo });

/**
 * Reglas de la solicitud (spec R2, R5, R10). Cada error trae el campo del
 * formulario que lo causa, para mostrarlo al lado.
 */
export function validarSolicitud({
  tipo, modalidad, fecha, inicio, fechas, noches, adultos, ninos, edadesNinos = [], temporadas = [], cierres, config, ahora,
  habitaciones = 1, cupo = null, t = textosCotizar("es")
}) {
  const errores = [];
  const e = t.err;

  if (!modalidad.activo) errores.push(error("MODALIDAD_INACTIVA", e.modalidadInactiva, "modalidadId"));

  if (modalidad.tipo === "noche" && (!Number.isInteger(noches) || noches < 1 || noches > MAX_NOCHES)) {
    errores.push(error("NOCHES_INVALIDAS", e.nochesInvalidas(MAX_NOCHES), "noches"));
  }

  // Con varias habitaciones (C2) la capacidad se multiplica; una cama de dormitorio va de a una.
  const h = tipo.porPersona ? 1 : habitaciones;
  const enHabitaciones = e.enHabitaciones(h);
  if (!Number.isInteger(habitaciones) || habitaciones < 1 || habitaciones > MAX_HABITACIONES) {
    errores.push(error("HABITACIONES_INVALIDAS", e.habitacionesInvalidas(MAX_HABITACIONES), "habitaciones"));
  }
  if (adultos < 1) errores.push(error("ADULTOS_INVALIDOS", e.adultosInvalidos, "adultos"));
  if (adultos > tipo.capacidadAdultos * h) {
    errores.push(error("CAPACIDAD", e.capAdultos(tipo.capacidadAdultos * h, enHabitaciones), "adultos"));
  }
  if (ninos > tipo.capacidadNinos * h) {
    errores.push(error("CAPACIDAD", tipo.capacidadNinos === 0 ? e.sinNinos : e.capNinos(tipo.capacidadNinos * h, enHabitaciones), "ninos"));
  }
  if (adultos + ninos > tipo.capacidadMax * h) {
    errores.push(error("CAPACIDAD", e.capTotal(tipo.capacidadMax * h, enHabitaciones), "adultos"));
  }

  // Inventario (C1): las camas o habitaciones libres de la noche más llena.
  if (cupo && cupo.libres !== null) {
    const pide = tipo.porPersona ? adultos + ninos : habitaciones;
    if (cupo.libres <= 0) {
      errores.push(error("SIN_CUPO", tipo.porPersona ? e.sinCamas : e.sinHabitaciones, "fecha"));
    } else if (pide > cupo.libres) {
      errores.push(error("SIN_CUPO", tipo.porPersona ? e.quedanCamas(cupo.libres) : e.quedanHabitaciones(cupo.libres), tipo.porPersona ? "adultos" : "habitaciones"));
    }
  }

  const horasFaltan = horasEntre(ahora, inicio);
  if (horasFaltan <= 0) {
    errores.push(error("FECHA_PASADA", e.fechaPasada, "hora"));
  } else if (horasFaltan < config.anticipacionMinHoras) {
    errores.push(error("ANTICIPACION_INSUFICIENTE", e.anticipacion(config.anticipacionMinHoras), "hora"));
  }
  if (horasFaltan > MAX_DIAS_ADELANTE * 24) {
    errores.push(error("FECHA_LEJANA", e.fechaLejana, "fecha"));
  }

  // Mínimo de noches de la temporada en la que cae la llegada (B2).
  if (modalidad.tipo === "noche" && Number.isInteger(noches) && fecha) {
    const conMinimo = temporadas.filter(t => t.minNoches && t.desde <= fecha && fecha <= t.hasta)
      .sort((a, b) => b.minNoches - a.minNoches)[0];
    if (conMinimo && noches < conMinimo.minNoches) {
      errores.push(error("MIN_NOCHES", e.minNoches(conMinimo.nombre, conMinimo.minNoches), "noches"));
    }
  }

  // Con cargo por niño hay que saber la edad de cada uno (B4).
  if (ninos > 0 && !tipo.porPersona && config.ninosGratisHasta != null && config.cargoNinoNoche && edadesNinos.length !== ninos) {
    errores.push(error("EDADES_NINOS", e.edades, "edadesNinos"));
  }

  const cerrada = fechas.find(f => cierres.some(c => c.fechaDesde <= f && f <= c.fechaHasta));
  if (cerrada) {
    errores.push(error("FECHA_CERRADA", e.cerrada((t.fecha ?? fechaCorta)(cerrada)), "fecha"));
  }

  return errores;
}

/**
 * Cotización completa.
 * @param {object} p
 * @param {object} p.tipo - hotel_tipos_habitacion (capacidades, porPersona)
 * @param {object} p.modalidad - hotel_modalidades
 * @param {string} p.fecha - "YYYY-MM-DD" de llegada / ingreso
 * @param {string} [p.hora] - "HH:mm": ingreso (horas) o llegada estimada (noche)
 * @param {number} [p.noches]
 * @param {number} p.adultos
 * @param {number} [p.ninos]
 * @param {Array<{ fechaDesde: string, fechaHasta: string }>} p.cierres - ya filtrados para este producto
 * @param {object} p.config - configuración de reservas resuelta (con aviso y texto)
 * @param {Date} [p.ahora]
 */
export function cotizarHotel({
  tipo, modalidad, fecha, hora, noches = null, adultos, ninos = 0, cierres = [], config, ahora = new Date(),
  temporadas = [], edadesNinos = [], extrasCatalogo = [], extrasElegidos = [], nacionalidad = null,
  habitaciones = 1, cupo = null, plan = null, idioma = "es"
}) {
  const t = textosCotizar(idioma);
  // Una cama de dormitorio se reserva de a una persona: no hay "2 habitaciones".
  const nHab = tipo.porPersona ? 1 : habitaciones;
  const { inicio, fin, fechas } = ventanaEstadia({
    modalidad, fecha, hora, noches, horaCheckin: config.horaCheckin, horaCheckout: config.horaCheckout
  });
  // Las temporadas solo ajustan noches: un bloque por horas tiene su precio fijo.
  const temporadasNoche = modalidad.tipo === "noche" ? temporadas : [];
  const errores = validarSolicitud({
    tipo, modalidad, fecha, inicio, fechas, noches, adultos, ninos, edadesNinos, temporadas: temporadasNoche, cierres, config, ahora,
    habitaciones, cupo: modalidad.tipo === "noche" ? cupo : null, t
  });

  const personas = adultos + ninos;
  const esHoras = modalidad.tipo === "horas";
  const alojamiento = lineasPrecio({ modalidad, personas, fechas, porPersona: tipo.porPersona, temporadas: temporadasNoche, habitaciones: nHab, t });
  const ninosLinea = lineaNinos({ edadesNinos, noches, esHoras, porPersona: tipo.porPersona, config, t });
  if (ninosLinea) alojamiento.push(ninosLinea);
  // Plan de tarifa (C5): "No reembolsable −10 %" sobre el alojamiento.
  if (plan?.ajustePct) {
    const base = redondear(alojamiento.reduce((s, l) => s + l.total, 0));
    const ajuste = redondear(base * plan.ajustePct / 100);
    alojamiento.push({ descripcion: `${plan.nombre} (${plan.ajustePct} %)`, cantidad: 1, precioUnitario: ajuste, total: ajuste });
  }
  const extras = lineasExtras({ catalogo: extrasCatalogo, elegidos: extrasElegidos, noches, personas, esHoras, t });
  errores.push(...extras.errores);

  // IGV (B5): con la nacionalidad, se aplica; sin ella (la ficha), se informa
  // cuánto pagaría un extranjero.
  const montoAlojamiento = redondear(alojamiento.reduce((s, l) => s + l.total, 0));
  const descuento = config.exoneraIgvExtranjeros ? descuentoIgv(montoAlojamiento) : 0;
  const exoneradoIgv = descuento > 0 && !!nacionalidad && nacionalidad !== "PE";
  const lineas = [...alojamiento, ...extras.lineas];
  if (exoneradoIgv) {
    lineas.push({ descripcion: t.igv, cantidad: 1, precioUnitario: -descuento, total: -descuento });
  }
  const total = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const aPagar = montoACuenta(total, config);

  const horasFaltan = horasEntre(ahora, inicio);
  const aviso = config.avisoProximoHoras && horasFaltan > 0 && horasFaltan < config.avisoProximoHoras
    ? { texto: textoAviso(config.avisoProximoTexto, inicio, ahora), hora: horaLima(inicio) }
    : null;

  return {
    inicio,
    fin,
    noches: modalidad.tipo === "noche" ? noches : null,
    horas: modalidad.tipo === "horas" ? modalidad.horas : null,
    lineas,
    total,
    montoAPagar: aPagar,
    saldoDestino: redondear(total - aPagar),
    aviso,
    errores,
    extras: extras.snapshot,
    habitaciones: nHab,
    plan: plan ? { id: plan.id, nombre: plan.nombre, ajustePct: plan.ajustePct, reembolsable: plan.reembolsable } : null,
    // Camas o habitaciones libres en la noche más llena (C1); null = sin inventario.
    quedan: modalidad.tipo === "noche" && cupo ? cupo.libres : null,
    edadesNinos: ninos > 0 ? edadesNinos.slice(0, ninos) : [],
    exoneradoIgv,
    // Solo cuando no se sabe la nacionalidad: "Extranjeros: S/ X sin IGV".
    totalExtranjero: descuento > 0 && !nacionalidad ? redondear(total - descuento) : null
  };
}
