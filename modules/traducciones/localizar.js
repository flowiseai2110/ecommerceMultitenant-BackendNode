import { traduccionesDe } from "./texto-local.js";

/**
 * Textos de la tienda en el idioma del visitante (docs/specs/idiomas D5, diseno.md B5).
 * Solo se usa en la capa de la tienda: repositorios y admin no la ven.
 *
 * `idioma` es el objeto Idioma (req.idioma) o su código. Funciona igual para
 * cualquier idioma: el base no tiene traducciones guardadas, así que la fila
 * sale tal cual, sin copiarla.
 *
 * @param {object} fuente - una entrada de FUENTES
 * @param {object} fila - con su columna `traducciones`
 */
export function localizar(fuente, fila, idioma) {
  if (!fila) return fila;
  const tr = traduccionesDe(fila.traducciones, idioma?.codigo ?? idioma);
  return Object.keys(tr).length ? fuente.aplicar(fila, tr) : fila;
}

/**
 * Decorator de un serializer de la tienda: localiza la fila antes de
 * serializarla. GenericController le pasa `{ idioma }` como segundo argumento.
 */
export const localizado = (serializar, fuente) => (fila, ctx) => serializar(localizar(fuente, fila, ctx?.idioma));
