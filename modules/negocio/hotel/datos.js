import { SECCIONES_COMUNES, SECCIONES_RESERVAS } from "../secciones.js";

/** Hotel / hostal: se reserva por tipo de habitación (noche o por horas). */
export const hotel = {
  // Textos fijos que muestra su tienda: los traduce el dueño (docs/specs/idiomas D8).
  gruposTextos: Object.freeze(["comun", "reservas", "hotel", "correos", "errores"]),
  // Cómo se llama su catálogo en Traducciones ("Tu contenido"; docs/specs/idiomas, diseno.md A1).
  nombreCatalogo: "Habitaciones",
  carrito: false,
  recibeReservas: true,
  planDePagos: false,
  transmisiones: false,
  alquilerPorHoras: false,
  marcas: false,
  diseno: {
    plantillaPorDefecto: "hotel-boutique",
    secciones: Object.freeze([...SECCIONES_COMUNES, ...SECCIONES_RESERVAS, "habitaciones"]),
    layoutPorDefecto: Object.freeze({}),
    rubroEnPlantillas: false
  },
  // El comprobante se emite en el check-out, junto con los consumos.
  configReservas: { avisoProximoHoras: 2, comprobanteEn: "en_el_servicio" },
  // Formulario de la reserva (reservas/formulario.js): la fecha de nacimiento y el
  // registro de huéspedes van en el check-in, como en Booking (plantillas-por-rubro, parte 4).
  formularioReserva: { documento: "obligatorio", nacionalidad: "obligatorio", nacimiento: "oculto", horaLlegada: "opcional", comentarios: "opcional" },
  // {negocio} / {alNegocio}: el hotel, el hostal, la casa… (tipo de alojamiento, hospedaje-completo B1).
  textoAviso: "Tu reserva es para dentro de poco. Si {negocio} no la confirma antes de las {hora}, se anula. Te recomendamos llamar o escribir {alNegocio} por WhatsApp."
};
