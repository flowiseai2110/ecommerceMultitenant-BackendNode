import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Agencia de tours: salidas por fecha. */
export const tours = {
  recibeReservas: true,
  planDePagos: false,
  transmisiones: false,
  diseno: {
    plantillaPorDefecto: "tours-catalogo",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "tours"])
  },
  configReservas: { avisoProximoHoras: 24, comprobanteEn: "al_pagar" },
  textoAviso: "Tu tour sale pronto ({hora}). La agencia necesita confirmar el cupo y organizar la salida; si no la confirma antes, la solicitud se anula. Te recomendamos escribir a la agencia por WhatsApp."
};
