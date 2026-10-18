import { clave } from "../../idiomas/clave.js";
import { e, fechaHora, fila } from "../correo.comun.js";

// Lo propio de una estadía en los correos de la reserva (docs/specs/antipatrones 3b).

// Hotel: según el tipo de alojamiento (hospedaje-completo B1). Un hostal no es "el hotel".
const VOZ_ALOJAMIENTO = {
  hotel: { Negocio: clave("El hotel|voz"), alNegocio: clave("al hotel|voz"), enNegocio: clave("en el hotel|voz") },
  hostal: { Negocio: clave("El hostal|voz"), alNegocio: clave("al hostal|voz"), enNegocio: clave("en el hostal|voz") },
  casa: { Negocio: clave("La casa|voz"), alNegocio: clave("a la casa|voz"), enNegocio: clave("en la casa|voz") },
  apart: { Negocio: clave("El apart|voz"), alNegocio: clave("al apart|voz"), enNegocio: clave("en el apart|voz") },
  lodge: { Negocio: clave("El lodge|voz"), alNegocio: clave("al lodge|voz"), enNegocio: clave("en el lodge|voz") },
  posada: { Negocio: clave("La posada|voz"), alNegocio: clave("a la posada|voz"), enNegocio: clave("en la posada|voz") }
};
const VOZ_HOTEL = { inicio: clave("la hora de ingreso|voz"), conf: clave("la disponibilidad|voz") };

/** "2 adultos, 1 niño". */
function textoPersonas(r, t) {
  const plural = (n, uno, varios) => t(n === 1 ? uno : varios, { n });
  const adultos = plural(r.adultos, clave("{n} adulto"), clave("{n} adultos"));
  return r.ninos ? `${adultos}, ${plural(r.ninos, clave("{n} niño"), clave("{n} niños"))}` : adultos;
}

function estadia(r, t) {
  if (r.modalidad?.tipo === "horas") return t(clave("{n} horas"), { n: r.horas ?? "" });
  return t(r.noches === 1 ? clave("{n} noche") : clave("{n} noches"), { n: r.noches });
}

/** Filas propias del resumen: habitación, estadía, entrada, salida y personas. */
function resumenHotel(r, t) {
  const f = (v) => e(fechaHora(v, t));
  const et = (k) => e(t(k));
  return fila(et(clave("Habitación")), e(`${r.habitaciones > 1 ? `${r.habitaciones} × ` : ""}${r.producto.nombre ?? "—"}`)) +
    fila(et(clave("Estadía")), e(estadia(r, t))) +
    fila(et(clave("Entrada|estadia")), f(r.inicio)) +
    fila(et(clave("Salida")), f(r.fin)) +
    fila(et(clave("Personas")), e(textoPersonas(r, t)));
}

export const CORREO_HOTEL = {
  voz: (r) => ({ ...(VOZ_ALOJAMIENTO[r.negocio?.alojamiento] ?? VOZ_ALOJAMIENTO.hotel), ...VOZ_HOTEL }),
  detalle: resumenHotel,
  asuntoSolicitud: (r) => `🛎️ Nueva solicitud ${r.codigo}: ${r.modalidad.etiqueta} · ingreso ${fechaHora(r.inicio)}`,
  avisaConsumos: true
};
