import { aCentimos, aSoles } from "../precios/precio-vigente.js";

/**
 * Una línea del pedido tal como la leen el dueño (ficha del pedido) y el cliente
 * (seguimiento): lo cobrado, el precio regular, el descuento y de dónde vino
 * (docs/specs/campanas-descuento R8.3, CA-8.2). Pura.
 *
 * El descuento no se guarda: se deriva de la foto de la línea, `(regular − unitario) × cantidad`.
 * `origenDescuento`: "campana" (con `campanaNombre`), "oferta" (del producto) o "ninguno";
 * null en un pedido anterior a precio-en-servidor (sin foto del regular). Los textos
 * ("Black Friday", "Oferta del producto", "Ninguno") los pone cada front en su idioma.
 *
 * @param {object} detalle - Fila de `pedido_detalles`.
 * @returns {object} la misma fila + `descuentoPromocion` (soles o null) y `origenDescuento`.
 */
export function lineaDePedido(detalle) {
  const { precioRegular, precioUnitario, precioOrigen, cantidad } = detalle;
  if (precioRegular == null) return { ...detalle, descuentoPromocion: null, origenDescuento: null };
  const porUnidad = Math.max(0, aCentimos(precioRegular) - aCentimos(precioUnitario));
  return {
    ...detalle,
    descuentoPromocion: aSoles(porUnidad * cantidad),
    origenDescuento: porUnidad > 0 && (precioOrigen === "campana" || precioOrigen === "oferta") ? precioOrigen : "ninguno"
  };
}
