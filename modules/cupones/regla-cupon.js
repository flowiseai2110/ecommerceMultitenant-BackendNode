import { clave } from "../idiomas/clave.js";
import { aCentimos, redondearCentimos } from "../precios/precio-vigente.js";

/** El cupón de una campaña fuera de su ventana (docs/specs/campanas-descuento R4.8, CA-4.7). */
export const CUPON_CAMPANA_NO_VIGENTE = clave("Este cupón es de la campaña {nombre} y ya no está vigente");

/**
 * Regla del cupón (docs/specs/precio-en-servidor): la usan el checkout para
 * mostrar el descuento (validarCupon) y la creación del pedido para cobrarlo.
 * Pura: sin BD. Los montos van en céntimos.
 *
 * @param {object|null} cupon - Fila de `cupones`.
 * @param {{ subtotal: number, ahora: Date, usosCliente?: number|null }} ctx
 *   subtotal en céntimos (ya con oferta); usosCliente null = no se sabe (sin cliente).
 * @returns {{ valido: true, descuento: number } | { valido: false, clave: string, params?: object }}
 */
export function evaluarCupon(cupon, { subtotal, ahora, usosCliente = null }) {
  const invalido = (k, params) => ({ valido: false, clave: k, params });

  if (!cupon) return invalido(clave("Cupón no válido"));
  if (!cupon.activo) return invalido(clave("Cupón inactivo"));
  if (cupon.fechaInicio && cupon.fechaInicio > ahora) return invalido(clave("Cupón aún no vigente"));
  if (cupon.fechaFin && cupon.fechaFin < ahora) return invalido(clave("Cupón expirado"));
  if (cupon.usoMaximo != null && cupon.usoActual >= cupon.usoMaximo) return invalido(clave("Cupón agotado"));
  const minimo = aCentimos(cupon.minimoCompra);
  if (minimo > 0 && subtotal < minimo) {
    return invalido(clave("Compra mínima requerida: {minimo}"), { minimo: String(cupon.minimoCompra) });
  }
  if (cupon.usoMaximoPorCliente != null && usosCliente != null && usosCliente >= cupon.usoMaximoPorCliente) {
    return invalido(clave("Ya usaste este cupón el máximo de veces permitido"));
  }

  const descuento = cupon.tipo === "porcentaje"
    ? redondearCentimos(subtotal * Number(cupon.valor) / 100)
    : aCentimos(cupon.valor);
  // Nunca más que el subtotal (un 150 % o un monto fijo mayor dejan el total en 0, no negativo).
  return { valido: true, descuento: Math.min(descuento, subtotal) };
}
