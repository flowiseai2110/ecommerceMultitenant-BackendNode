import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Agencia de tours: salidas por fecha. */
export const tours = {
  recibeReservas: true,
  planDePagos: false,
  transmisiones: false,
  alquilerPorHoras: false,
  marcas: false,
  diseno: {
    plantillaPorDefecto: "tours-catalogo",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "tours"])
  },
  configReservas: { avisoProximoHoras: 24, comprobanteEn: "al_pagar" },
  // Formulario de la reserva (reservas/formulario.js): como hasta ahora.
  formularioReserva: { documento: "obligatorio", nacionalidad: "obligatorio", nacimiento: "opcional", comentarios: "opcional" },
  textoAviso: "Tu tour sale pronto ({hora}). La agencia necesita confirmar el cupo y organizar la salida; si no la confirma antes, la solicitud se anula. Te recomendamos escribir a la agencia por WhatsApp."
};
