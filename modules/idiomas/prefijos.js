/**
 * Resolución por prefijo de ruta (docs/specs/idiomas, diseno.md A2): la única
 * regla con que el catálogo de textos fijos del servidor da grupo y ubicación
 * a cada texto. Es la misma que usa FrontendStore scripts/claves-tienda.mjs.
 *
 * Un prefijo cubre la ruta igual a él, lo que está dentro de su carpeta
 * ("reservas" cubre "reservas/estados.js") y las declaraciones de su archivo
 * ("reservas/reservas.emails.js" cubre "reservas/reservas.emails.js#layout").
 * Gana el más largo.
 */

/** El prefijo de `mapa` que gana para `ruta`, o undefined. */
export function prefijoDe(mapa, ruta) {
  return Object.keys(mapa)
    .filter((p) => ruta === p || ruta.startsWith(`${p}/`) || ruta.startsWith(`${p}#`))
    .sort((a, b) => b.length - a.length)[0];
}

/** El valor del prefijo que gana para `ruta`, o undefined. */
export function porPrefijo(mapa, ruta) {
  const prefijo = prefijoDe(mapa, ruta);
  return prefijo === undefined ? undefined : mapa[prefijo];
}

/** "Calendario de la estadía" → "calendario-de-la-estadia": id estable de una sección. */
export const idDeNombre = (nombre) => nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
