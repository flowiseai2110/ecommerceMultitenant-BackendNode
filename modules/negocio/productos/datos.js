import { SECCIONES_COMUNES } from "../secciones.js";

/** Tienda de productos: catálogo con carrito, envíos y pago contra entrega. */
export const productos = {
  // Textos fijos que muestra su tienda: los traduce el dueño (docs/specs/idiomas D8).
  gruposTextos: Object.freeze(["comun", "productos", "correos", "errores"]),
  // Cómo se llama su catálogo en Traducciones ("Tu contenido"; docs/specs/idiomas, diseno.md A1).
  nombreCatalogo: "Productos",
  recibeReservas: false,
  planDePagos: false,
  transmisiones: false,
  alquilerPorHoras: false,
  // Catálogo de marcas de la tienda (productos.marcaId): filtro del store y faceta del asesor.
  marcas: true,
  diseno: {
    plantillaPorDefecto: "clasica",
    secciones: Object.freeze([...SECCIONES_COMUNES, "categorias", "productos", "oferta"])
  },
  configReservas: { avisoProximoHoras: null, comprobanteEn: "al_pagar" },
  // Sin reservas: el aviso de reserva próxima no aplica (rige el del hotel si se pidiera).
  textoAviso: null
};
