import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Hotel / hostal: se reserva por tipo de habitación (noche o por horas). */
export const hotel = {
  recibeReservas: true,
  planDePagos: false,
  transmisiones: false,
  alquilerPorHoras: false,
  diseno: {
    plantillaPorDefecto: "hotel-boutique",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "habitaciones"])
  },
  // El comprobante se emite en el check-out, junto con los consumos.
  configReservas: { avisoProximoHoras: 2, comprobanteEn: "en_el_servicio" },
  // {negocio} / {alNegocio}: el hotel, el hostal, la casa… (tipo de alojamiento, hospedaje-completo B1).
  textoAviso: "Tu reserva es para dentro de poco. Si {negocio} no la confirma antes de las {hora}, se anula. Te recomendamos llamar o escribir {alNegocio} por WhatsApp."
};
