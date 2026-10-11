import { SECCIONES_COMUNES } from "../secciones.js";

/** Tienda de productos: catálogo con carrito, envíos y pago contra entrega. */
export const productos = {
  recibeReservas: false,
  planDePagos: false,
  transmisiones: false,
  diseno: {
    plantillaPorDefecto: "clasica",
    secciones: Object.freeze([...SECCIONES_COMUNES, "categorias", "productos", "oferta"])
  },
  configReservas: { avisoProximoHoras: null, comprobanteEn: "al_pagar" },
  // Sin reservas: el aviso de reserva próxima no aplica (rige el del hotel si se pidiera).
  textoAviso: null
};
