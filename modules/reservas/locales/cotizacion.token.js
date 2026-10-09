import { SignJWT, jwtVerify } from "jose";
import config from "../../../config/index.js";
import { NotFoundError } from "../../../utils/errors.js";

/**
 * Token del link de una cotización de local (`/:slug/cotizacion/:token`,
 * alquiler-locales R4). Mismo patrón que reservas.token.js, con su propio
 * `aud`: un token de cotización no abre una reserva ni al revés. La vigencia
 * real la decide `local_cotizaciones.vence_en`; el token dura más para que
 * una cotización vencida se pueda ver como "vencida".
 */

const AUDIENCE = "local-cotizacion";
const TTL_DIAS = 120;

function secretKey(secret = config.reservas.linkSecret) {
  if (!secret) throw new Error("RESERVAS_LINK_SECRET no está configurado");
  return new TextEncoder().encode(secret);
}

export async function firmarTokenCotizacion({ cotizacionId, tiendaId }, opts = {}) {
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(cotizacionId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlDias ?? TTL_DIAS}d`)
    .sign(secretKey(opts.secret));
}

/**
 * @returns {Promise<{ cotizacionId: string, tiendaId: string }>}
 * @throws {NotFoundError} token alterado, vencido o de otro uso
 */
export async function verificarTokenCotizacion(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { cotizacionId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Cotización", "Cotización no encontrada");
  }
}
