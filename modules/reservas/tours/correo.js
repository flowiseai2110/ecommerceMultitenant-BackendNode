import { clave } from "../../idiomas/clave.js";
import { e, fechaHora, fila } from "../correo.comun.js";

// Lo propio de una salida de tour en los correos de la reserva (docs/specs/antipatrones 3b).

const VOZ_TOUR = { Negocio: clave("La agencia|voz"), alNegocio: clave("a la agencia|voz"), enNegocio: clave("en destino|voz"), inicio: clave("la hora de salida|voz"), conf: clave("la disponibilidad de la salida|voz") };

/** Filas propias del resumen: tour, salida, punto de encuentro y pasajeros. */
function resumenTour(r, t) {
  const f = (v) => e(fechaHora(v, t));
  const et = (k) => e(t(k));
  const pasajeros = (r.pasajeros ?? []).map((p) => `${p.cantidad} ${p.nombre.toLowerCase()}`).join(", ") || "—";
  return fila(et(clave("Tour")), e(r.producto.nombre ?? "—")) +
    fila(et(clave("Salida|tour")), f(r.inicio)) +
    (r.tour?.puntoEncuentro ? fila(et(clave("Punto de encuentro")), e(r.tour.puntoEncuentro)) : "") +
    fila(et(clave("Pasajeros")), e(pasajeros));
}

/** Reserva confirmada: se presenta en la salida. */
const confirmadaTour = (r, t) => ({ pie: e(t(clave("Presenta esta confirmación o tu código de reserva en la salida."))) });

export const CORREO_TOUR = {
  voz: () => VOZ_TOUR,
  detalle: resumenTour,
  asuntoSolicitud: (r) => `🧭 Nueva solicitud ${r.codigo}: ${r.producto.nombre} · ${r.personas} pax · salida ${fechaHora(r.inicio)}`,
  confirmada: confirmadaTour,
  avisaConsumos: false
};
