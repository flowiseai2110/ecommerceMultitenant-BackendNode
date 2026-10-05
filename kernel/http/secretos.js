import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara un secreto recibido contra el esperado en tiempo constante.
 * Se comparan los hashes (largo fijo) para no filtrar el largo del secreto
 * ni lanzar con buffers de distinto tamaño.
 * @param {string|undefined} recibido - Valor que llegó en la request.
 * @param {string|undefined} esperado - Valor configurado; vacío = nunca coincide.
 * @returns {boolean}
 */
export function secretoIgual(recibido, esperado) {
  if (!esperado || typeof recibido !== "string" || !recibido) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
