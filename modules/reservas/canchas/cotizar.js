import { horasEntre, horaLima, instanteLima } from "../tiempo.js";
import { MAX_DIAS_ADELANTE, montoACuenta, textoAviso } from "../hotel/cotizar.js";
import { seCruzan } from "../locales/franja.js";
import { FERIADOS } from "../../libro-reclamaciones/plazos.js";
import { minutosCierre, minutosHora, tramosDelTurno } from "./tarifa.js";

/**
 * Cotización de un turno de cancha (docs/specs/alquiler-canchas R3–R7):
 * función pura, como la del hotel y la de tours. La usan la vitrina
 * (/cotizar), la creación de la reserva y los tests.
 *
 * `ocupadas` son las franjas vigentes de la cancha ese día; sirven para avisar
 * antes de enviar. La que decide al reservar es la restricción de exclusión.
 */

const redondear = (n) => Math.round(n * 100) / 100;
const error = (codigo, mensaje, campo = null) => ({ codigo, mensaje, campo });
const ETIQUETA = { dia: "Tarifa día", noche: "Tarifa noche" };

export const DURACION_POR_DEFECTO = 60;

/** "1 h", "1 h 30", "2 h". */
export const textoDuracion = (min) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;

/**
 * @param {object} p
 * @param {{ nombre: string, formato: string, precioDia: number, precioNoche: number }} p.cancha
 * @param {object} p.config - configuración de reservas resuelta (horario de canchas)
 * @param {string} p.fecha - "YYYY-MM-DD"
 * @param {string|null} p.hora - "HH:mm" de inicio
 * @param {number|null} p.duracionMin
 * @param {Array<{ inicio: Date, fin: Date }>} [p.ocupadas]
 * @param {Array<{ fechaDesde: string, fechaHasta: string }>} [p.cierres]
 */
export function cotizarCancha({ cancha, config, fecha, hora, duracionMin, ocupadas = [], cierres = [], ahora = new Date(), feriados = FERIADOS }) {
  const duracion = duracionMin ?? DURACION_POR_DEFECTO;
  const errores = [];
  const apertura = config.canchaApertura;
  const cierre = config.canchaCierre;

  if (!hora) errores.push(error("HORA_REQUERIDA", "Elige la hora de inicio", "hora"));
  if (!config.canchaDuraciones.includes(duracion)) {
    errores.push(error("DURACION_INVALIDA", "Esa duración no está disponible. Elige otra.", "duracionMin"));
  }
  const fueraDeHorario = Boolean(hora) && (
    minutosHora(hora) % 60 !== 0
    || minutosHora(hora) < minutosHora(apertura)
    || minutosHora(hora) + duracion > minutosCierre(cierre)
  );
  if (fueraDeHorario) {
    errores.push(error("FUERA_DE_HORARIO", `Los turnos empiezan a la hora en punto, de ${apertura} a ${cierre === "00:00" ? "medianoche" : cierre}.`, "hora"));
  }

  const inicio = instanteLima(fecha, hora ?? apertura);
  const fin = new Date(inicio.getTime() + duracion * 60 * 1000);

  if (hora) {
    const horasFaltan = horasEntre(ahora, inicio);
    if (horasFaltan <= 0) {
      errores.push(error("HORA_PASADA", "Esa hora ya pasó. Elige otra.", "hora"));
    } else if (horasFaltan < config.anticipacionMinHoras) {
      errores.push(error("ANTICIPACION_INSUFICIENTE", `Reserva con al menos ${config.anticipacionMinHoras} h de anticipación.`, "hora"));
    } else if (horasFaltan > MAX_DIAS_ADELANTE * 24) {
      errores.push(error("FECHA_LEJANA", "Esa fecha todavía no está abierta para reservas.", "fecha"));
    }
  }
  if (cierres.some((c) => c.fechaDesde <= fecha && fecha <= c.fechaHasta)) {
    errores.push(error("FECHA_CERRADA", "La cancha no atiende esa fecha. Elige otra.", "fecha"));
  }
  if (hora && !fueraDeHorario && ocupadas.some((o) => seCruzan(inicio, fin, new Date(o.inicio), new Date(o.fin)))) {
    errores.push(error("HORARIO_OCUPADO", "Ese horario ya está ocupado. Elige otro.", "hora"));
  }

  const tramos = hora && !fueraDeHorario ? tramosDelTurno({ fecha, hora, duracionMin: duracion, cancha, config, feriados }) : [];
  const lineas = tramos.map((t) => ({
    descripcion: `${cancha.nombre} · ${ETIQUETA[t.tarifa]} ${t.desde}–${t.hasta}`,
    cantidad: 1,
    precioUnitario: t.total,
    total: t.total
  }));
  const total = redondear(tramos.reduce((s, t) => s + t.total, 0));
  const montoAPagar = montoACuenta(total, config);

  const horasFaltan = horasEntre(ahora, inicio);
  const aviso = hora && config.avisoProximoHoras && horasFaltan > 0 && horasFaltan < config.avisoProximoHoras
    ? { texto: textoAviso(config.avisoProximoTexto, inicio, ahora), hora: horaLima(inicio) }
    : null;

  return {
    inicio, fin, noches: null, horas: null, personas: null,
    lineas, total, montoAPagar, saldoDestino: redondear(total - montoAPagar), aviso, errores,
    duracionMin: duracion, tramos
  };
}
