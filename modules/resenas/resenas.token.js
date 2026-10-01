import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";
import { UnauthorizedError } from "../../utils/errors.js";

/**
 * Token del link "califica tu compra" que el vendedor manda por WhatsApp tras
 * la entrega. Prueba que quien reseña recibió ESE pedido aunque haya comprado
 * como invitado: solo el backend puede firmarlo (HS256 con RESENAS_LINK_SECRET)
 * y vence a los `linkTtlDias`.
 *
 * Es un JWT propio, distinto de los de Supabase: `aud` lo ata a este uso para
 * que no se pueda reutilizar en otro endpoint aunque se comparta el secreto.
 */

const AUDIENCE = "resena-pedido";

function secretKey(secret = config.resenas.linkSecret) {
  if (!secret) {
    // Falla al usarse, no al importar: el resto de la API sigue funcionando
    // aunque no se haya configurado todavía el link de reseñas.
    throw new Error("RESENAS_LINK_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

/**
 * @param {{ pedidoId: string, tiendaId: string }} pedido
 * @param {{ secret?: string, ttlDias?: number }} [opts] - Para tests.
 * @returns {Promise<string>}
 */
export async function firmarTokenResena({ pedidoId, tiendaId }, opts = {}) {
  const ttlDias = opts.ttlDias ?? config.resenas.linkTtlDias;
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(pedidoId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlDias}d`)
    .sign(secretKey(opts.secret));
}

/**
 * @param {string} token
 * @param {{ secret?: string }} [opts] - Para tests.
 * @returns {Promise<{ pedidoId: string, tiendaId: string }>}
 * @throws {UnauthorizedError} Token alterado, vencido o de otro uso.
 */
export async function verificarTokenResena(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { pedidoId: payload.sub, tiendaId: payload.tid };
  } catch (error) {
    const vencido = error?.code === "ERR_JWT_EXPIRED";
    const err = new UnauthorizedError(vencido
      ? "El enlace para calificar venció. Pide uno nuevo a la tienda."
      : "El enlace para calificar no es válido.");
    // El errorHandler solo expone details (no el message): la tienda usa el
    // motivo para decirle al comprador si pedir un link nuevo o revisar el que tiene.
    err.details = { motivo: vencido ? "ENLACE_VENCIDO" : "ENLACE_INVALIDO" };
    throw err;
  }
}
