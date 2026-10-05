import { diaSemana, fechaCorta, horasEntre, horaLima, instanteLima, sumarDias, sumarHoras } from "../tiempo.js";
import { MAX_DIAS_ADELANTE, montoACuenta, textoAviso } from "../hotel/cotizar.js";

/**
 * Cotización de una solicitud de tour: función pura (sin BD), como la del
 * hotel. La usan la vitrina (/cotizar), la creación de la solicitud y el
 * asesor IA (spec R3).
 *
 * Sin cupo por salida: la agencia confirma cada solicitud. Las reglas son los
 * días y horas de salida del tour, las fechas cerradas, la anticipación y el
 * máximo de pasajeros por solicitud.
 */

export const MAX_PASAJEROS_DEFECTO = 30;

const redondear = (n) => Math.round(n * 100) / 100;

export const NOMBRES_DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** Día del calendario en la convención del tour: 1 = lunes … 7 = domingo. */
export const diaTour = (fecha) => diaSemana(fecha) || 7;

/** "lunes, miércoles y viernes" / "todos los días". */
export function textoDiasSalida(dias) {
  const orden = [...dias].sort((a, b) => a - b);
  if (orden.length === 7) return "todos los días";
  const nombres = orden.map(d => NOMBRES_DIAS[d]);
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

/**
 * Ventana del tour. Sin duración en horas, se asume que termina ese mismo día
 * (medianoche): así una salida de las 5:00 no se da por "completada" a las 5:00.
 */
export function ventanaTour({ fecha, hora, duracionHoras }) {
  const inicio = instanteLima(fecha, hora);
  const fin = duracionHoras ? sumarHoras(inicio, duracionHoras) : instanteLima(sumarDias(fecha, 1));
  return { inicio, fin };
}

/**
 * Líneas de precio: una por tipo de pasajero con cantidad > 0.
 * @returns {{ lineas: Array, snapshot: Array, personas: number, desconocidos: string[] }}
 */
export function lineasPasajeros({ tiposPasajero, pasajeros }) {
  const porId = new Map(tiposPasajero.map(t => [t.id, t]));
  const lineas = [];
  const snapshot = [];
  const desconocidos = [];
  let personas = 0;
  for (const p of pasajeros) {
    if (!p.cantidad) continue;
    const tipo = porId.get(p.tipoId);
    if (!tipo || !tipo.activo) { desconocidos.push(p.tipoId); continue; }
    const precio = Number(tipo.precio);
    personas += p.cantidad;
    lineas.push({
      descripcion: `${tipo.nombre} × ${p.cantidad}`,
      cantidad: p.cantidad,
      precioUnitario: precio,
      total: redondear(precio * p.cantidad)
    });
    snapshot.push({ tipoId: tipo.id, nombre: tipo.nombre, cantidad: p.cantidad, precio });
  }
  return { lineas, snapshot, personas, desconocidos };
}

const error = (codigo, mensaje, campo = null) => ({ codigo, mensaje, campo });

/** Reglas de la solicitud de tour (spec R3.2, R5, R10). */
export function validarSolicitudTour({ tour, fecha, hora, idioma, inicio, personas, desconocidos, cierres, config, ahora }) {
  const errores = [];

  if (!hora) {
    errores.push(error("HORA_REQUERIDA", "Elige la hora de salida", "hora"));
  } else if (!tour.horasSalida.includes(hora)) {
    errores.push(error("HORA_INVALIDA", `Este tour sale a las ${tour.horasSalida.join(", ")}`, "hora"));
  }

  if (!tour.diasSalida.includes(diaTour(fecha))) {
    errores.push(error("DIA_SIN_SALIDA", `Este tour sale los ${textoDiasSalida(tour.diasSalida)}. Elige otra fecha`, "fecha"));
  }

  if (idioma && !tour.idiomas.includes(idioma)) {
    errores.push(error("IDIOMA_INVALIDO", "Este tour no se ofrece en ese idioma", "idioma"));
  }

  if (desconocidos.length) {
    errores.push(error("TIPO_PASAJERO_INVALIDO", "Uno de los tipos de pasajero ya no está disponible. Actualiza la página", "pasajeros"));
  }
  const maximo = tour.maxPasajeros ?? MAX_PASAJEROS_DEFECTO;
  if (personas < 1) {
    errores.push(error("SIN_PASAJEROS", "Indica cuántas personas van", "pasajeros"));
  } else if (personas > maximo) {
    errores.push(error("MAX_PASAJEROS", `Puedes solicitar hasta ${maximo} ${maximo === 1 ? "persona" : "personas"} por reserva. Para grupos más grandes, escribe a la agencia`, "pasajeros"));
  }

  if (hora) {
    const horasFaltan = horasEntre(ahora, inicio);
    if (horasFaltan <= 0) {
      errores.push(error("FECHA_PASADA", "Esa salida ya pasó. Elige una fecha futura", "fecha"));
    } else if (horasFaltan < config.anticipacionMinHoras) {
      errores.push(error("ANTICIPACION_INSUFICIENTE",
        `Los tours se reservan con al menos ${config.anticipacionMinHoras} ${config.anticipacionMinHoras === 1 ? "hora" : "horas"} de anticipación`, "fecha"));
    }
    if (horasFaltan > MAX_DIAS_ADELANTE * 24) {
      errores.push(error("FECHA_LEJANA", "Solo se puede reservar con hasta un año de anticipación", "fecha"));
    }
  }

  if (cierres.some(c => c.fechaDesde <= fecha && fecha <= c.fechaHasta)) {
    errores.push(error("FECHA_CERRADA", `No hay salida el ${fechaCorta(fecha)}. Elige otra fecha`, "fecha"));
  }

  return errores;
}

/**
 * Cotización completa.
 * @param {object} p
 * @param {object} p.tour - tours (diasSalida, horasSalida, idiomas, duracionHoras, maxPasajeros)
 * @param {Array} p.tiposPasajero - tour_tipos_pasajero del tour
 * @param {Array<{ tipoId: string, cantidad: number }>} p.pasajeros
 * @param {string} p.fecha - "YYYY-MM-DD"
 * @param {string|null} p.hora - "HH:mm" de salida
 * @param {string|null} [p.idioma]
 * @param {Array<{ fechaDesde: string, fechaHasta: string }>} p.cierres - ya filtrados para este tour
 * @param {object} p.config - configuración de reservas resuelta
 * @param {Date} [p.ahora]
 */
export function cotizarTour({ tour, tiposPasajero, pasajeros = [], fecha, hora, idioma = null, cierres = [], config, ahora = new Date() }) {
  // Sin hora válida la ventana se calcula con la primera salida: los errores ya lo explican.
  const { inicio, fin } = ventanaTour({ fecha, hora: hora || tour.horasSalida[0] || "00:00", duracionHoras: tour.duracionHoras });
  const { lineas, snapshot, personas, desconocidos } = lineasPasajeros({ tiposPasajero, pasajeros });
  const errores = validarSolicitudTour({ tour, fecha, hora, idioma, inicio, personas, desconocidos, cierres, config, ahora });

  const total = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const aPagar = montoACuenta(total, config);

  const horasFaltan = horasEntre(ahora, inicio);
  const aviso = hora && config.avisoProximoHoras && horasFaltan > 0 && horasFaltan < config.avisoProximoHoras
    ? { texto: textoAviso(config.avisoProximoTexto, inicio, ahora), hora: horaLima(inicio) }
    : null;

  return {
    inicio,
    fin,
    noches: null,
    horas: null,
    personas,
    pasajeros: snapshot,
    idioma: idioma || tour.idiomas[0] || null,
    lineas,
    total,
    montoAPagar: aPagar,
    saldoDestino: redondear(total - aPagar),
    aviso,
    errores
  };
}
