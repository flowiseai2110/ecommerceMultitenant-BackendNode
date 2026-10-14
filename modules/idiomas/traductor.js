/**
 * Traductor de textos fijos (docs/specs/idiomas D7, diseno.md B7). Puro: no
 * lee la BD, recibe el diccionario ya armado (textos.service.js → diccionario).
 *
 *   const t = crearTraductor({ "{n} noches": "{n} nights" });
 *   t("{n} noches", { n: 3 })   // "3 nights"
 *   t("Salida|tour")            // sin traducción: "Salida" (el texto base, sin contexto)
 *   t.plantilla("{n} noches")   // "{n} nights", sin llenar (para escaparla antes en HTML)
 */

/** Texto base de una clave: sin el contexto que va después de "|". */
export const textoBase = (clave) => clave.split("|")[0];

/** Llena los marcadores {x}; uno sin valor queda como está. */
export const rellenar = (texto, params) =>
  (params ? texto.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k] ?? "") : m)) : texto);

/** @param {Record<string, string>} [diccionario] - clave → texto traducido */
export function crearTraductor(diccionario = {}) {
  const plantilla = (clave) => diccionario[clave] ?? textoBase(clave);
  const t = (clave, params) => rellenar(plantilla(clave), params);
  t.plantilla = plantilla;
  return t;
}

/** El idioma base: sin diccionario, cada clave es su propio texto. */
export const TRADUCTOR_BASE = crearTraductor();
