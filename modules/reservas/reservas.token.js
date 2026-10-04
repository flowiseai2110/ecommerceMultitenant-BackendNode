import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";
import { NotFoundError } from "../../utils/errors.js";

/**
 * Token del link de seguimiento de una reserva (`/:slug/reserva/:token`). Es lo
 * único que da acceso a la reserva sin login: muestra el estado, los datos de
 * pago, permite subir la captura y es la confirmación imprimible. Mismo patrón
 * que libro.token.js, con su propio `aud`.
 */

const AUDIENCE = "reserva-seguimiento";

function secretKey(secret = config.reservas.linkSecret) {
  if (!secret) {
    // Falla al usarse, no al importar: el resto de la API sigue funcionando.
    throw new Error("RESERVAS_LINK_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

/**
 * @param {{ pedidoId: string, tiendaId: string }} reserva
 * @param {{ secret?: string, ttlDias?: number }} [opts] - Para tests.
 */
export async function firmarTokenReserva({ pedidoId, tiendaId }, opts = {}) {
  const ttlDias = opts.ttlDias ?? config.reservas.linkTtlDias;
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(pedidoId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlDias}d`)
    .sign(secretKey(opts.secret));
}

/**
 * @returns {Promise<{ pedidoId: string, tiendaId: string }>}
 * @throws {NotFoundError} token alterado, vencido o de otro uso
 */
export async function verificarTokenReserva(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { pedidoId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Reserva", "Reserva no encontrada");
  }
}
