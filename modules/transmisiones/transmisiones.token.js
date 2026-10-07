import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";
import { NotFoundError, UnauthorizedError } from "../../utils/errors.js";

/**
 * Token del enlace de un invitado (`/:slug/t/:token`). Es lo único que da
 * acceso a la página de la transmisión. Mismo patrón que reservas.token.js,
 * con su propio `aud`, pero SIN vencimiento: anular o regenerar el enlace
 * (sube `version`) y las fechas en que vale se controlan en la BD, así que
 * "Guardar 1 año" o un cambio de hora no obligan a reenviar enlaces.
 */

const AUDIENCE = "transmision-invitado";

function secretKey(secret = config.transmisiones.linkSecret) {
  if (!secret) {
    // Falla al usarse, no al importar: el resto de la API sigue funcionando.
    throw new Error("TRANSMISIONES_LINK_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

/**
 * @param {{ invitacionId: string, tiendaId: string, version: number }} invitacion
 * @param {{ secret?: string }} [opts] - Para tests.
 */
export async function firmarTokenInvitacion({ invitacionId, tiendaId, version }, opts = {}) {
  return new SignJWT({ tid: tiendaId, v: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(invitacionId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .sign(secretKey(opts.secret));
}

/**
 * @returns {Promise<{ invitacionId: string, tiendaId: string, version: number }>}
 * @throws {NotFoundError} token alterado o de otro uso
 */
export async function verificarTokenInvitacion(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid || !Number.isInteger(payload.v)) throw new Error("payload incompleto");
    return { invitacionId: payload.sub, tiendaId: payload.tid, version: payload.v };
  } catch {
    throw new NotFoundError("Invitación", "Este enlace no es válido");
  }
}

// ============================================
// App Transmitir (R11): token de sesión tras canjear el QR
// ============================================

const AUDIENCE_APP = "app-transmitir";

function secretApp(secret = config.transmisiones.appSecret) {
  if (!secret) throw new Error("TRANSMISIONES_APP_SECRET (o TRANSMISIONES_LINK_SECRET) no está configurado");
  return new TextEncoder().encode(secret);
}

/**
 * Vale hasta una hora después del corte. Lleva la versión de la clave: si el
 * negocio la regenera (R5.5), la sesión de la app deja de servir (R11.9).
 * @param {{ transmisionId: string, tiendaId: string, claveVersion: number, expiraEn: Date }} datos
 */
export async function firmarTokenApp({ transmisionId, tiendaId, claveVersion, expiraEn }, opts = {}) {
  return new SignJWT({ tid: tiendaId, cv: claveVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(transmisionId)
    .setAudience(AUDIENCE_APP)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiraEn.getTime() / 1000))
    .sign(secretApp(opts.secret));
}

/** @throws {UnauthorizedError} token alterado, vencido o de otro uso */
export async function verificarTokenApp(token, opts = {}) {
  const key = secretApp(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE_APP, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid || !Number.isInteger(payload.cv)) throw new Error("payload incompleto");
    return { transmisionId: payload.sub, tiendaId: payload.tid, claveVersion: payload.cv };
  } catch {
    throw new UnauthorizedError("La sesión de la app ya no es válida. Vuelve a escanear el QR");
  }
}

// ============================================
// Aviso de los 15 minutos (R7.5): enlace del correo para extender sin sesión
// ============================================

const AUDIENCE_ACCION = "transmision-accion";

/** Vale hasta media hora después del corte. Quien lo tiene puede extender (y autorizar excedente). */
export async function firmarTokenAccion({ transmisionId, tiendaId, expiraEn }, opts = {}) {
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(transmisionId)
    .setAudience(AUDIENCE_ACCION)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiraEn.getTime() / 1000))
    .sign(secretKey(opts.secret));
}

/** @throws {NotFoundError} token alterado, vencido o de otro uso */
export async function verificarTokenAccion(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE_ACCION, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { transmisionId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Transmisión", "Este enlace ya venció o no es válido");
  }
}

// ============================================
// Grabación (Fase 4): enlace del anfitrión para ver y descargar
// ============================================

const AUDIENCE_ANFITRION = "transmision-anfitrion";

/** Sin vencimiento propio: los plazos (30 días o 1 año) se leen de la BD. */
export async function firmarTokenAnfitrion({ transmisionId, tiendaId }, opts = {}) {
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(transmisionId)
    .setAudience(AUDIENCE_ANFITRION)
    .setIssuedAt()
    .sign(secretKey(opts.secret));
}

/** @throws {NotFoundError} token alterado o de otro uso */
export async function verificarTokenAnfitrion(token, opts = {}) {
  const key = secretKey(opts.secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE_ANFITRION, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { transmisionId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Grabación", "Este enlace no es válido");
  }
}
