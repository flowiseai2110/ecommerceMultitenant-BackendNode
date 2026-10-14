// Catálogo de efectos festivos (docs/specs/efectos-festivos E1.1). Es la
// única lista: el schema la usa como enum y el admin la recibe del
// calendario. El storefront tiene un registro tipado con la misma lista y
// trata un tipo que no conoce como "solo el saludo" (backend más nuevo).
//
// "ninguno" apaga el efecto de un preset sin perder el saludo.

export const EFECTOS = Object.freeze([
  "nieve",
  "fuegos",
  "globos",
  "confeti",
  "rojoblanco",
  "corazones",
  "petalos",
  "murcielagos",
  "etiquetas",
  "estrellas",
  "ninguno"
]);

export const MODOS_EFECTO = Object.freeze(["clave", "campana"]);

export const MAX_SALUDO = 80;
