import { diaSemana, fechaLima, horaLima, instanteLima, sumarDias, sumarHoras } from "../tiempo.js";

/**
 * Recepción (docs/specs/recepcion): reglas puras del mostrador. Sin base de
 * datos para poder testearlas: horarios de salida, precios y extensiones.
 */

/** Antes de esta hora, quien entra "por noche" ocupa la noche que ya empezó: sale hoy. */
export const MADRUGADA_HASTA = "06:00";
/** El tablero pone ámbar una estadía a los N minutos de su salida. */
export const AVISO_MINUTOS = 15;
export const MAX_NOCHES_MOSTRADOR = 30;

const redondear = (n) => Math.round(n * 100) / 100;
const esVieSab = (fecha) => [5, 6].includes(diaSemana(fecha));

/** Precio de lista de una noche (vie/sáb si lo tiene) o de un bloque por horas. */
export function precioLista(modalidad, fechaNoche) {
  if (modalidad.tipo === "noche" && fechaNoche && esVieSab(fechaNoche) && modalidad.precioVieSab != null) {
    return Number(modalidad.precioVieSab);
  }
  return Number(modalidad.precio);
}

/** "3 horas", "1 noche", "2 noches". */
export function etiqueta(modalidad, noches = 1) {
  if (modalidad.tipo === "horas") return `${modalidad.horas} horas`;
  return `${noches} ${noches === 1 ? "noche" : "noches"}`;
}

/** Fecha de la primera noche de quien entra ahora: de madrugada es la de ayer. */
export function primeraNoche(ahora) {
  const hoy = fechaLima(ahora);
  return horaLima(ahora) < MADRUGADA_HASTA ? sumarDias(hoy, -1) : hoy;
}

/**
 * Entrada (R3.1): hasta cuándo se queda y cuánto cuesta según la lista.
 * Por noche sale a la hora de check-out del día siguiente a su última noche.
 */
export function calcularEntrada({ modalidad, ahora, noches = 1, horaCheckout }) {
  if (modalidad.tipo === "horas") {
    return { fin: sumarHoras(ahora, modalidad.horas), precioLista: Number(modalidad.precio), concepto: etiqueta(modalidad) };
  }
  const desde = primeraNoche(ahora);
  const fechas = Array.from({ length: noches }, (_, i) => sumarDias(desde, i));
  return {
    fin: instanteLima(sumarDias(desde, noches), horaCheckout),
    precioLista: redondear(fechas.reduce((s, f) => s + precioLista(modalidad, f), 0)),
    concepto: etiqueta(modalidad, noches)
  };
}

/**
 * Extender (R4.1) con una modalidad del tipo:
 * - horas: suma el bloque a la salida prevista (si ya se pasó, cuenta desde la salida: ese tiempo se usó).
 * - noche sobre una estadía por horas: "pasa a noche"; sale al check-out y paga la diferencia con lo ya cargado por alojamiento.
 * - noche sobre una noche: una noche más.
 */
export function calcularExtension({ estadia, modalidad, horaCheckout }) {
  const fin = new Date(estadia.fin);
  if (modalidad.tipo === "horas") {
    return { fin: sumarHoras(fin, modalidad.horas), modalidad: estadia.modalidad, precioLista: Number(modalidad.precio), concepto: `+${modalidad.horas} horas` };
  }
  if (estadia.modalidad === "horas") {
    const noche = primeraNoche(new Date(estadia.inicio));
    const precioNoche = precioLista(modalidad, noche);
    const alojamiento = (estadia.cargos ?? []).reduce((s, c) => s + Number(c.monto), 0);
    return {
      fin: instanteLima(sumarDias(noche, 1), horaCheckout),
      modalidad: "noche",
      precioLista: redondear(Math.max(precioNoche - alojamiento, 0)),
      concepto: "Pasa a noche"
    };
  }
  // La noche que se agrega es la del día en que hoy le tocaba salir.
  const noche = fechaLima(fin);
  return { fin: instanteLima(sumarDias(noche, 1), horaCheckout), modalidad: "noche", precioLista: precioLista(modalidad, noche), concepto: "+1 noche" };
}

/**
 * Estado de una habitación en el tablero (R2.1).
 * @returns {{ estado: "libre"|"ocupada"|"por_vencer"|"vencida"|"por_limpiar"|"mantenimiento", minutos: number|null }}
 */
export function estadoHabitacion(habitacion, estadia, ahora) {
  if (estadia) {
    const minutos = Math.round((new Date(estadia.fin).getTime() - ahora.getTime()) / 60000);
    const estado = minutos < 0 ? "vencida" : minutos <= AVISO_MINUTOS ? "por_vencer" : "ocupada";
    return { estado, minutos };
  }
  if (habitacion.estado === "mantenimiento") return { estado: "mantenimiento", minutos: null };
  if (habitacion.limpieza === "por_limpiar") return { estado: "por_limpiar", minutos: null };
  return { estado: "libre", minutos: null };
}

/** Números "1".."N" para las habitaciones nuevas, sin repetir los que ya existen. */
export function numerosNuevos(existentes, cantidad) {
  const usados = new Set(existentes);
  const nuevos = [];
  for (let n = 1; nuevos.length < cantidad; n++) {
    if (!usados.has(String(n))) nuevos.push(String(n));
  }
  return nuevos;
}

/**
 * Caja (R5.3): totales de un turno. El efectivo esperado en el cajón es lo
 * inicial + lo cobrado en efectivo + ingresos − egresos; Yape, Plin y
 * tarjeta no pasan por el cajón.
 */
export function resumenCaja({ montoInicial, cobros, movimientos }) {
  const porForma = { efectivo: 0, yape: 0, plin: 0, tarjeta: 0 };
  for (const c of cobros) porForma[c.formaPago] = redondear((porForma[c.formaPago] ?? 0) + Number(c.monto));
  const suma = (tipo) => redondear(movimientos.filter(m => m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0));
  const ingresos = suma("ingreso");
  const egresos = suma("egreso");
  return {
    porForma,
    totalCobrado: redondear(Object.values(porForma).reduce((s, v) => s + v, 0)),
    ingresos,
    egresos,
    efectivoEsperado: redondear(Number(montoInicial) + porForma.efectivo + ingresos - egresos)
  };
}

/** Cargos cobrados por debajo de la lista (R5.5): el dueño ve cada descuento. */
export function descuentos(cargos) {
  return cargos.filter(c => Number(c.monto) < Number(c.precioLista))
    .map(c => ({ ...c, descuento: redondear(Number(c.precioLista) - Number(c.monto)) }));
}

/**
 * ¿La estadía ocupa la noche `fecha` para el cupo de la web? Solo las de
 * noche que están en la habitación a la medianoche de esa noche.
 */
export function ocupaNoche(estadia, fecha) {
  if (estadia.modalidad !== "noche") return false;
  const medianoche = instanteLima(sumarDias(fecha, 1), "00:00");
  return new Date(estadia.inicio) < medianoche && new Date(estadia.fin) > medianoche;
}
