import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Eventos: funciones con venta de entradas y transmisión en vivo. */
export const eventos = {
  recibeReservas: true,
  planDePagos: false,
  // Transmisión en vivo de la función (docs/specs/transmision-eventos).
  transmisiones: true,
  alquilerPorHoras: false,
  marcas: false,
  diseno: {
    plantillaPorDefecto: "eventos-cartelera",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "eventos"])
  },
  configReservas: { avisoProximoHoras: 6, comprobanteEn: "al_pagar" },
  textoAviso: "El organizador verifica los pagos por Yape o transferencia a mano. Si tu pago no se verifica antes de la función ({hora}), lleva tu captura: la validarán en la puerta."
};
