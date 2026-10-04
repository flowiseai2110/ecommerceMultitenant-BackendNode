import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";
import { NotFoundError } from "../../utils/errors.js";

/**
 * Token del enlace permanente a la constancia de una hoja de reclamación
 * (`/:slug/libro-reclamaciones/hoja/:token`). Es lo único que da acceso a la
 * hoja sin login: solo el backend puede firmarlo (HS256 con LIBRO_LINK_SECRET)
 * y dura más que los 2 años de conservación obligatoria.
 *
 * `aud` lo ata a este uso: un token de reseñas no sirve acá aunque se
 * comparta el secreto.
 */

const AUDIENCE = "libro-hoja";

function secretKey(secret = config.libro.linkSecret) {
  if (!secret) {
    // Falla al usarse, no al importar: el resto de la API sigue funcionando.
    throw new Error("LIBRO_LINK_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

/**
 * @param {{ hojaId: string, tiendaId: string }} hoja
 * @param {{ secret?: string, ttlDias?: number }} [opts] - Para tests.
 * @returns {Promise<string>}
 */
export async function firmarTokenHoja({ hojaId, tiendaId }, opts = {}) {
  const ttlDias = opts.ttlDias ?? config.libro.linkTtlDias;
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(hojaId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlDias}d`)
    .sign(secretKey(opts.secret));
}

/**
 * @param {string} token
 * @param {{ secret?: string }} [opts] - Para tests.
 * @returns {Promise<{ hojaId: string, tiendaId: string }>}
 * @throws {NotFoundError} Token alterado, vencido o de otro uso: para quien lo
 *   abre, la hoja "no existe" (no se distingue un id inválido de uno ajeno).
 */
export async function verificarTokenHoja(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { hojaId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Hoja de reclamación", "Hoja de reclamación no encontrada");
  }
}
