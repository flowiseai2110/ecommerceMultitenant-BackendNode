import {
  diaSemana, fechaCorta, fechaLima, horaLima, horasEntre, instanteLima, rangoFechas, sumarDias, sumarHoras
} from "../tiempo.js";

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
 */

export const MAX_NOCHES = 30;
export const MAX_DIAS_ADELANTE = 365;

const redondear = (n) => Math.round(n * 100) / 100;

/** Viernes o sábado: las noches que suelen costar más. */
const esVieSab = (fecha) => [5, 6].includes(diaSemana(fecha));

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

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

/**
 * Líneas de precio. Las noches se agrupan por precio para que el detalle sea
 * corto ("3 noches × S/ 160") sin perder qué noches son.
 */
export function lineasPrecio({ modalidad, personas, fechas, porPersona }) {
  const factor = porPersona ? personas : 1;
  const sufijo = porPersona ? ` · ${personas} ${personas === 1 ? "persona" : "personas"}` : "";

  if (modalidad.tipo === "horas") {
    const precio = Number(modalidad.precio);
    return [{
      descripcion: `Estadía de ${modalidad.horas} horas${sufijo}`,
      cantidad: factor,
      precioUnitario: precio,
      total: redondear(precio * factor)
    }];
  }

  const grupos = new Map();
  for (const f of fechas) {
    const precio = esVieSab(f) && modalidad.precioVieSab != null ? Number(modalidad.precioVieSab) : Number(modalidad.precio);
    if (!grupos.has(precio)) grupos.set(precio, []);
    grupos.get(precio).push(f);
  }
  return [...grupos.entries()].map(([precio, dias]) => {
    const cantidad = dias.length * factor;
    const detalle = dias.map(d => `${DIAS[diaSemana(d)]} ${fechaCorta(d)}`).join(", ");
    return {
      descripcion: `${dias.length} ${dias.length === 1 ? "noche" : "noches"} (${detalle})${sufijo}`,
      cantidad,
      precioUnitario: precio,
      total: redondear(precio * cantidad)
    };
  });
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
export function validarSolicitud({ tipo, modalidad, inicio, fechas, noches, adultos, ninos, cierres, config, ahora }) {
  const errores = [];

  if (!modalidad.activo) errores.push(error("MODALIDAD_INACTIVA", "Esta modalidad ya no está disponible", "modalidadId"));

  if (modalidad.tipo === "noche" && (!Number.isInteger(noches) || noches < 1 || noches > MAX_NOCHES)) {
    errores.push(error("NOCHES_INVALIDAS", `Elige entre 1 y ${MAX_NOCHES} noches`, "noches"));
  }

  if (adultos < 1) errores.push(error("ADULTOS_INVALIDOS", "Debe haber al menos un adulto", "adultos"));
  if (adultos > tipo.capacidadAdultos) {
    errores.push(error("CAPACIDAD", `Esta habitación admite hasta ${tipo.capacidadAdultos} ${tipo.capacidadAdultos === 1 ? "adulto" : "adultos"}`, "adultos"));
  }
  if (ninos > tipo.capacidadNinos) {
    errores.push(error("CAPACIDAD", tipo.capacidadNinos === 0
      ? "Esta habitación no admite niños"
      : `Esta habitación admite hasta ${tipo.capacidadNinos} ${tipo.capacidadNinos === 1 ? "niño" : "niños"}`, "ninos"));
  }
  if (adultos + ninos > tipo.capacidadMax) {
    errores.push(error("CAPACIDAD", `Esta habitación admite hasta ${tipo.capacidadMax} personas en total`, "adultos"));
  }

  const horasFaltan = horasEntre(ahora, inicio);
  if (horasFaltan <= 0) {
    errores.push(error("FECHA_PASADA", "Elige una fecha y hora futuras", "hora"));
  } else if (horasFaltan < config.anticipacionMinHoras) {
    errores.push(error("ANTICIPACION_INSUFICIENTE",
      `Las reservas se piden con al menos ${config.anticipacionMinHoras} ${config.anticipacionMinHoras === 1 ? "hora" : "horas"} de anticipación`, "hora"));
  }
  if (horasFaltan > MAX_DIAS_ADELANTE * 24) {
    errores.push(error("FECHA_LEJANA", "Solo se puede reservar con hasta un año de anticipación", "fecha"));
  }

  const cerrada = fechas.find(f => cierres.some(c => c.fechaDesde <= f && f <= c.fechaHasta));
  if (cerrada) {
    errores.push(error("FECHA_CERRADA", `No se reciben reservas para el ${fechaCorta(cerrada)}. Elige otra fecha`, "fecha"));
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
export function cotizarHotel({ tipo, modalidad, fecha, hora, noches = null, adultos, ninos = 0, cierres = [], config, ahora = new Date() }) {
  const { inicio, fin, fechas } = ventanaEstadia({
    modalidad, fecha, hora, noches, horaCheckin: config.horaCheckin, horaCheckout: config.horaCheckout
  });
  const errores = validarSolicitud({ tipo, modalidad, inicio, fechas, noches, adultos, ninos, cierres, config, ahora });

  const personas = adultos + ninos;
  const lineas = lineasPrecio({ modalidad, personas, fechas, porPersona: tipo.porPersona });
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
    errores
  };
}
