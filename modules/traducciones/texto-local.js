/**
 * Cadena de respaldo de un texto traducible (docs/specs/idiomas D4, diseno.md B3).
 *
 * Cada fila guarda en `traducciones` un objeto por idioma:
 *   { <codigo>: { campo: { t: traducción, o: texto base del que salió, m: corregido a mano } } }
 * (en las listas, como los servicios de una habitación, `t` y `o` son listas).
 *
 * Sirve igual para cualquier idioma, también el base: el español no tiene
 * traducciones guardadas, así que cae solo a su propio texto.
 */

export const vacio = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Estado de la traducción de un campo frente a su texto base actual. */
export function estadoCampo(base, tr) {
  if (vacio(base)) return null;
  if (!tr || vacio(tr.t)) return "falta";
  return igual(tr.o, base) ? "al_dia" : "desactualizada";
}

/** Texto a mostrar: la traducción manual, si no la que está al día; si no, el texto base. */
export function textoLocal(base, tr) {
  if (vacio(base) || !tr || vacio(tr.t)) return base;
  // Una lista manual de otro largo que la base se respeta igual.
  return tr.m || igual(tr.o, base) ? tr.t : base;
}

/** Traducciones de un idioma guardadas en una fila (`{}` si no tiene). */
export const traduccionesDe = (traducciones, codigo) => traducciones?.[codigo] ?? {};
