/**
 * Tipo de alojamiento (docs/specs/hospedaje-completo B1): cómo se nombra el
 * negocio en la vitrina y en los correos. Un hostal no es "el hotel".
 */
export const TIPOS_ALOJAMIENTO = ["hotel", "hostal", "casa", "apart", "lodge", "posada"];

const NOMBRES = {
  hotel: { el: "el hotel", al: "al hotel", en: "en el hotel" },
  hostal: { el: "el hostal", al: "al hostal", en: "en el hostal" },
  casa: { el: "la casa", al: "a la casa", en: "en la casa" },
  apart: { el: "el apart", al: "al apart", en: "en el apart" },
  lodge: { el: "el lodge", al: "al lodge", en: "en el lodge" },
  posada: { el: "la posada", al: "a la posada", en: "en la posada" }
};

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {string|null|undefined} tipo
 * @returns {{ negocio: string, Negocio: string, alNegocio: string, enNegocio: string }}
 */
export function vozAlojamiento(tipo) {
  const n = NOMBRES[tipo] ?? NOMBRES.hotel;
  return { negocio: n.el, Negocio: mayuscula(n.el), alNegocio: n.al, enNegocio: n.en };
}
