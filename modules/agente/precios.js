/**
 * El LLM no recibe ni escribe precios (docs/specs/agente-ventas/spec.md, R6).
 *
 * Las tarjetas muestran el precio tal como viene de la base. Al modelo le
 * llegan indicadores calculados por el código, así puede recomendar ("es la
 * más económica", "está en oferta") sin poder equivocarse en un monto. Como no
 * recibe precios, cualquier precio en su texto es inventado.
 */

/** Precio que paga el cliente: la oferta si existe y es menor. */
export function precioEfectivo(p) {
  const base = Number(p.precioBase);
  const oferta = p.precioOferta == null ? null : Number(p.precioOferta);
  return oferta !== null && oferta > 0 && oferta < base ? oferta : base;
}

/**
 * Indicadores de precio por producto, relativos a los demás resultados.
 * @param {Array<{id:string, precioBase:any, precioOferta:any}>} productos
 * @param {number|null} precioMax - Presupuesto que pidió el cliente (input de la tool).
 * @returns {Map<string, {tiene_oferta:boolean, es_la_mas_economica:boolean, dentro_de_presupuesto?:boolean}>}
 */
export function indicadoresPrecio(productos, precioMax = null) {
  const efectivos = productos.map(precioEfectivo);
  const minimo = Math.min(...efectivos);

  return new Map(productos.map((p, i) => {
    const ind = {
      tiene_oferta: efectivos[i] < Number(p.precioBase),
      // Con un solo resultado no hay comparación que hacer.
      es_la_mas_economica: productos.length > 1 && efectivos[i] === minimo
    };
    if (typeof precioMax === "number") ind.dentro_de_presupuesto = efectivos[i] <= precioMax;
    return [p.id, ind];
  }));
}

// "S/ 199", "S/.199", "199 soles", "$50", "USD 20", "PEN 80".
const PATRON_PRECIO = /S\/\.?\s?\d|\d[\d.,]*\s?soles\b|\bsoles?\s?\d|\$\s?\d|\b(?:USD|PEN|US\$)\s?\d/i;

/**
 * ¿El texto del modelo menciona un monto? Las tallas ("talla 40") y cantidades
 * ("3 opciones") no cuentan: solo números junto a una moneda.
 * @param {string} texto
 * @returns {boolean}
 */
export function contienePrecio(texto) {
  return PATRON_PRECIO.test(texto);
}
