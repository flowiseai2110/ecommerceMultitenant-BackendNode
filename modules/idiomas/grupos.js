/**
 * Grupos del catálogo de textos fijos (docs/specs/idiomas D8, diseno.md B8).
 *
 * Cada clave de `textos_claves` pertenece a uno. Cada rubro declara en su
 * `datos.js` (`gruposTextos`) los que muestra su tienda: son los que el dueño
 * traduce y los que deben estar completos para que un idioma sea visible (P5).
 * El script de la tienda (FrontendStore scripts/claves-tienda.mjs) asigna
 * estos mismos nombres según la carpeta del componente.
 */
export const GRUPOS_TEXTOS = Object.freeze([
  "comun",      // marco, home, pago en línea, libro de reclamaciones: toda tienda
  "productos",  // catálogo, carrito, checkout, seguimiento del pedido
  "reservas",   // lo compartido por los rubros que reciben reservas
  "hotel",
  "tours",
  "eventos",
  "locales",
  "canchas",
  "correos",    // correos al cliente (claves del servidor, tasks.md 1.7)
  "errores"     // errores que la tienda muestra por `code` (D6)
]);

/** Cómo ve el dueño cada grupo en la pantalla Traducciones. */
export const ETIQUETA_GRUPO = Object.freeze({
  comun: "Textos generales de la tienda",
  productos: "Textos del catálogo y la compra",
  reservas: "Textos de la reserva",
  hotel: "Textos del hotel",
  tours: "Textos de los tours",
  eventos: "Textos de los eventos",
  locales: "Textos de los salones",
  canchas: "Textos de las canchas",
  correos: "Correos al cliente",
  errores: "Mensajes de error"
});
