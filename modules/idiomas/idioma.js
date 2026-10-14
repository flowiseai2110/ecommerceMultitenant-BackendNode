import { z } from "zod";

/**
 * Idioma de la tienda (docs/specs/idiomas D1, diseno.md B1).
 *
 * Por la app circula este objeto, no el código suelto: quien lo recibe pregunta
 * por sus datos (`locale`, `ia`, `esBase`), nunca por su identidad. La única
 * comparación de código de todo el sistema es la de `esBase`, aquí.
 */

/** Idioma en que el dueño escribe su tienda. Es fijo (spec, decisión 1). */
export const IDIOMA_BASE = "es";

/** BCP 47 acotado: es, qu, agr, es-PE (igual que el CHECK idiomas_codigo). */
export const CODIGO_IDIOMA = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export const codigoIdiomaSchema = z.string().trim().regex(CODIGO_IDIOMA, "Código de idioma inválido");

/**
 * @typedef {{ codigo: string, nombre: string, pais: string, locale: string,
 *   ia: boolean, avisoIa: boolean, activo: boolean, orden: number, esBase: boolean }} Idioma
 */

/** @param {object} fila - fila de `idiomas` @returns {Readonly<Idioma>} */
export function crearIdioma(fila) {
  return Object.freeze({
    codigo: fila.codigo,
    nombre: fila.nombre,
    pais: fila.pais,
    locale: fila.locale,
    ia: Boolean(fila.ia),
    avisoIa: Boolean(fila.avisoIa),
    activo: Boolean(fila.activo),
    orden: fila.orden ?? 0,
    esBase: fila.codigo === IDIOMA_BASE
  });
}
