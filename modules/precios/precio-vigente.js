/**
 * Precio vigente de un producto (docs/adr/ADR-0001, punto 1): la única regla de
 * precio del servidor. Pura: sin Prisma ni red (docs/specs/precio-en-servidor).
 *
 * Todo se calcula en céntimos enteros para no arrastrar errores de coma flotante;
 * se convierte a soles solo en el borde (aSoles). El único redondeo del sistema
 * es `redondearCentimos`.
 */

/** Soles (número, string o Decimal de Prisma) → céntimos enteros. null/vacío = 0. */
export const aCentimos = (monto) => (monto == null || monto === "" ? 0 : redondearCentimos(Number(monto) * 100));

/** Céntimos → soles. */
export const aSoles = (centimos) => centimos / 100;

/**
 * Redondea un monto en céntimos con decimales (p. ej. el 20 % de 1999 = 399,8) al
 * céntimo más cercano, mitad hacia arriba. El margen absorbe el error de coma
 * flotante (12,4999999 que en realidad es 12,5).
 */
export const redondearCentimos = (centimos) => Math.floor(centimos + 0.5 + 1e-9);

/**
 * Precio que paga el cliente por una unidad, en céntimos.
 * - Variante con precio propio (> 0): ese precio; la oferta es del producto y no
 *   se le aplica (precio-en-servidor D3).
 * - Si no: la oferta del producto si es > 0 y menor que el precio base; si no, el base.
 *
 * `contexto` = { ahora }: aquí entrarán las promociones de campanas-descuento
 * ("gana el mayor descuento", ADR-0001 punto 4). Hoy no se lee.
 *
 * @param {{ precioBase: any, precioOferta?: any }} producto
 * @param {{ precio?: any } | null} [variante]
 * @param {{ ahora?: Date }} [contexto]
 * @returns {{ unitario: number, regular: number, origen: "regular" | "oferta" }} en céntimos
 */
export function precioVigente(producto, variante = null, contexto = {}) {
  const precioVariante = aCentimos(variante?.precio);
  if (precioVariante > 0) return { unitario: precioVariante, regular: precioVariante, origen: "regular" };

  const base = aCentimos(producto.precioBase);
  const oferta = aCentimos(producto.precioOferta);
  const unitario = oferta > 0 && oferta < base ? oferta : base;
  return { unitario, regular: base, origen: unitario < base ? "oferta" : "regular" };
}
