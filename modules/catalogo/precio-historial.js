/**
 * Reglas puras sobre el historial del precio regular (docs/specs/campanas-descuento
 * R10.2 y R10.4). Sin BD: reciben las filas de `producto_precio_historial` ya leídas
 * (las trae precio-historial.repository.js) y fechas como Date o texto ISO.
 *
 * Fila: { productoId, varianteId, precioAnterior, precioNuevo, motivo, fecha }.
 * `motivo` es 'alta' | 'cambio' | 'linea_base'; solo 'cambio' puede ser una subida.
 */

export const DIAS_VENTANA = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

const aMs = (f) => (f instanceof Date ? f : new Date(f)).getTime();
const aNumero = (v) => (v === null || v === undefined ? null : Number(v));

/** El instante que queda `dias` días antes de `inicio`. */
export function restarDias(inicio, dias = DIAS_VENTANA) {
  return new Date(aMs(inicio) - dias * MS_DIA);
}

/**
 * Cambios que subieron el precio regular entre `desde` y `hasta` (ambos incluidos).
 * Una bajada no cuenta. Si el precio anterior o el nuevo es null (variante que usa el
 * precio del producto) no hay con qué comparar, así que tampoco cuenta.
 */
export function subidasEnVentana(historial, { desde, hasta }) {
  const d = aMs(desde);
  const h = aMs(hasta);
  return (historial ?? []).filter((fila) => {
    if (fila.motivo !== "cambio") return false;
    const antes = aNumero(fila.precioAnterior);
    const ahora = aNumero(fila.precioNuevo);
    if (antes === null || ahora === null) return false;
    const t = aMs(fila.fecha);
    return t >= d && t <= h && ahora > antes;
  });
}

/**
 * ¿Hay historial suficiente para avisar con confianza? Sí si el primer registro del
 * producto es de `inicio − 30 días` o antes (R10.4). `historial` es el de un producto.
 */
export function tieneHistorial(historial, inicio) {
  if (!historial || historial.length === 0) return false;
  const limite = aMs(restarDias(inicio));
  return historial.some((fila) => aMs(fila.fecha) <= limite);
}
