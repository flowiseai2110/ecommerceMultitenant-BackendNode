import { TRADUCTOR_BASE } from "./traductor.js";

/**
 * Error que la tienda puede mostrar en el idioma del visitante (docs/specs/idiomas D6).
 *
 *   throw errorConClave(ValidationError, clave("{courier} no llega a tu distrito."), { courier })
 *
 * `message` queda en el idioma base (logs, admin); `data` lleva además la
 * clave del catálogo y sus valores, y la tienda la traduce con su diccionario.
 * La clave va marcada con clave() donde se usa, para que entre al catálogo.
 */
export function errorConClave(ClaseError, k, params = {}, extra = {}) {
  const message = TRADUCTOR_BASE(k, params);
  return new ClaseError(message, { ...extra, message, clave: k, params });
}
