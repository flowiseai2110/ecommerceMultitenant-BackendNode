import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Eventos: funciones con venta de entradas y transmisión en vivo. */
export const eventos = {
  // Textos fijos que muestra su tienda: los traduce el dueño (docs/specs/idiomas D8).
  gruposTextos: Object.freeze(["comun", "reservas", "eventos", "correos", "errores"]),
  // Cómo se llama su catálogo en Traducciones ("Tu contenido"; docs/specs/idiomas, diseno.md A1).
  nombreCatalogo: "Eventos",
  carrito: false,
  recibeReservas: true,
  planDePagos: false,
  // Transmisión en vivo de la función (docs/specs/transmision-eventos).
  transmisiones: true,
  alquilerPorHoras: false,
  marcas: false,
  diseno: {
    plantillaPorDefecto: "eventos-cartelera",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "eventos"]),
    layoutPorDefecto: Object.freeze({}),
    rubroEnPlantillas: false
  },
  configReservas: { avisoProximoHoras: 6, comprobanteEn: "al_pagar" },
  textoAviso: "El organizador verifica los pagos por Yape o transferencia a mano. Si tu pago no se verifica antes de la función ({hora}), lleva tu captura: la validarán en la puerta."
};
