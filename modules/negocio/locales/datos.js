import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Local de eventos (alquiler-locales): salones por turno, cotización y plan de pagos. */
export const locales = {
  recibeReservas: true,
  // Separación, cuotas, garantía, tramos de cancelación y contrato (R1.2, R7, R8, R10).
  planDePagos: true,
  transmisiones: false,
  diseno: {
    plantillaPorDefecto: "locales-salones",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "salones"])
  },
  // El negocio acepta y la separación es el 40 % (alquiler-locales, plan).
  configReservas: { avisoProximoHoras: null, comprobanteEn: "al_pagar", cobro: "adelanto", adelantoPct: 40 },
  textoAviso: "Tu evento es pronto ({hora}). El local necesita confirmar la fecha y recibir la separación; te recomendamos escribir por WhatsApp."
};
