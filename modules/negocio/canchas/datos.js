import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Complejo de canchas sintéticas (alquiler-canchas): turnos por hora con tarifa de día y de noche. */
export const canchas = {
  // Textos fijos que muestra su tienda: los traduce el dueño (docs/specs/idiomas D8).
  gruposTextos: Object.freeze(["comun", "reservas", "canchas", "correos", "errores"]),
  // Cómo se llama su catálogo en Traducciones ("Tu contenido"; docs/specs/idiomas, diseno.md A1).
  nombreCatalogo: "Canchas",
  recibeReservas: true,
  planDePagos: false,
  transmisiones: false,
  // Horario del complejo y tarifa día/noche (R2): la vitrina arma la grilla de horas.
  alquilerPorHoras: true,
  marcas: false,
  diseno: {
    plantillaPorDefecto: "canchas-complejo",
    secciones: Object.freeze([
      ...SECCIONES_COMUNES, ...SECCIONES_RESERVAS,
      "canchas-portada", "canchas", "reservador", "pasos", "fijo-semanal", "liga"
    ]),
    // Verde cancha con el ámbar de los reflectores y títulos condensados, como la maqueta aprobada.
    temaPorDefecto: { paleta: "cancha-tinte", tipografia: "deportiva" },
    layoutPorDefecto: Object.freeze({}),
    rubroEnPlantillas: false
  },
  // Separar sin esperar respuesta: pago directo con el 50 % y la cancha apartada 30 min (R5).
  configReservas: {
    modoConfirmacion: "pago_directo", cobro: "adelanto", adelantoPct: 50, apartadoManualMin: 30,
    avisoProximoHoras: 2, comprobanteEn: "al_pagar",
    politicaCancelacion: "Hasta 24 horas antes cambias de día o te devolvemos el adelanto. Con menos de 24 horas el adelanto no se devuelve, pero puedes pasarlo a otra fecha del mismo mes."
  },
  textoAviso: "Tu partido es pronto ({hora}). Sube la captura del adelanto cuanto antes: si el pago no se verifica a tiempo, escribe a la cancha por WhatsApp."
};
