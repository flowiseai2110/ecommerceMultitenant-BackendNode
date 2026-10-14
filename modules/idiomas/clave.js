/**
 * Marca un texto fijo del servidor (docs/specs/idiomas D8). No hace nada en
 * tiempo de ejecución: `scripts/claves-servidor.mjs` busca estas marcas para
 * armar el catálogo (`modules/idiomas/claves/claves-servidor.json`).
 *
 *   const K = { noche: clave("{n} noche"), noches: clave("{n} noches") };
 *   t(K.noches, { n: 3 })
 *
 * La clave es el texto en el idioma base; "texto|contexto" distingue dos
 * usos del mismo texto que en otro idioma se traducen distinto.
 */
export const clave = (texto) => texto;
