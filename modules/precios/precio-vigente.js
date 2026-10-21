/**
 * Precio vigente de un producto (docs/adr/ADR-0001, punto 1): la única regla de
 * precio del servidor. Pura: sin Prisma ni red (docs/specs/precio-en-servidor).
 *
 * Todo se calcula en céntimos enteros para no arrastrar errores de coma flotante;
 * se convierte a soles solo en el borde (aSoles). El único redondeo del sistema
 * es `redondearCentimos`.
 */

import { aIsoLima } from "../campanas/calendario.js";

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
 * ¿La promoción vigente cubre al producto? (R4: toda la tienda, sus categorías
 * con subcategorías ya incluidas, o productos elegidos).
 */
export const cubre = (promocion, producto) =>
  promocion.alcance.tipo === "tienda" ||
  (promocion.alcance.tipo === "categorias" && promocion.alcance.categoriaIds.has(producto.categoriaId)) ||
  (promocion.alcance.tipo === "productos" && promocion.alcance.productoIds.has(producto.id));

/**
 * Precio que paga el cliente por una unidad, en céntimos. Candidatos:
 * - el regular: la variante con precio propio (> 0) o, si no, el precio base;
 * - la oferta del producto, solo sin variante con precio propio (precio-en-servidor
 *   D3) y si es > 0 y menor que el base;
 * - cada promoción vigente de `contexto.promociones` que cubre al producto
 *   (campanas-descuento R5): el regular menos su porcentaje, redondeado con
 *   `redondearCentimos` y nunca menos de 1 céntimo (R4.9).
 * Gana el menor (R5.4). Empate oferta-promoción → la oferta (E8: es el precio
 * propio del dueño); empate entre promociones → menor `orden` (el resolver de campañas).
 *
 * Sin promociones el resultado es idéntico al de precio-en-servidor P1: `campana`
 * solo viaja cuando gana una promoción.
 *
 * @param {{ id?: string, categoriaId?: string|null, precioBase: any, precioOferta?: any }} producto
 * @param {{ precio?: any } | null} [variante]
 * @param {{ ahora?: Date, promociones?: object[] }} [contexto] - De contextoDePrecios
 *   (precios/contexto.service.js); `promociones` sale de promocionesVigentes (campanas/promocion.js).
 * @returns {{ unitario: number, regular: number, origen: "regular" | "oferta" | "campana",
 *   campana?: { id, nombre, porcentaje, hasta, permitirCupones, permitirEnvioGratis } }} en céntimos
 */
export function precioVigente(producto, variante = null, contexto = {}) {
  const precioVariante = aCentimos(variante?.precio);
  const regular = precioVariante > 0 ? precioVariante : aCentimos(producto.precioBase);

  let mejor = { unitario: regular, regular, origen: "regular" };
  if (!(precioVariante > 0)) {
    const oferta = aCentimos(producto.precioOferta);
    if (oferta > 0 && oferta < regular) mejor = { unitario: oferta, regular, origen: "oferta" };
  }

  // Ordenadas por `orden`: con `<` estricto, en un empate se queda la oferta o la promoción anterior.
  for (const p of contexto.promociones ?? []) {
    if (!cubre(p, producto)) continue;
    const unitario = Math.max(1, redondearCentimos(regular * (100 - p.porcentaje) / 100));
    if (unitario < mejor.unitario) {
      mejor = {
        unitario,
        regular,
        origen: "campana",
        campana: {
          id: p.campanaId,
          nombre: p.nombre,
          porcentaje: p.porcentaje,
          hasta: p.hasta,
          permitirCupones: p.permitirCupones,
          permitirEnvioGratis: p.permitirEnvioGratis
        }
      };
    }
  }
  return mejor;
}

/**
 * Descuento sobre el precio regular en porcentaje entero más cercano (R6.3):
 * lo que dice la etiqueta "−N %". 0 sin descuento.
 */
export function porcentajeDescuento({ unitario, regular }) {
  return regular > 0 && unitario < regular ? Math.round((regular - unitario) * 100 / regular) : 0;
}

/**
 * El precio tal como lo ve la tienda (tarjeta, ficha, variante, asesor): en
 * soles, con el regular para tacharlo y de dónde viene el descuento. La tienda
 * solo lo dibuja (R6.1); nunca expone costo ni datos internos de la promoción.
 *
 * @returns {{ vigente: number, regular: number, origen: string, porcentaje: number,
 *   campana: { id: string, nombre: string, hasta: string } | null }} `hasta` en hora de Lima
 */
export function precioPublico(producto, variante = null, contexto = {}) {
  const precio = precioVigente(producto, variante, contexto);
  return {
    vigente: aSoles(precio.unitario),
    regular: aSoles(precio.regular),
    origen: precio.origen,
    porcentaje: porcentajeDescuento(precio),
    campana: precio.campana
      ? { id: precio.campana.id, nombre: precio.campana.nombre, hasta: aIsoLima(precio.campana.hasta) }
      : null
  };
}
