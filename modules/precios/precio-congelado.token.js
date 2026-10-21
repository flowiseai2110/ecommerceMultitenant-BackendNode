import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";

/**
 * Precio asegurado mientras se paga (docs/specs/campanas-descuento R8.4, E5): al
 * entrar al paso de pago la cotización firma, por línea, el precio que vio el
 * cliente. Al crear el pedido con un token válido de la misma tienda cada línea
 * cobra el menor entre el token y el precio de ese momento (R8.6): si la campaña
 * terminó o la apagaron se respeta lo que vio; si un precio bajó, paga menos.
 *
 * Sin tabla ni limpieza: el token vence solo. Mismo patrón que reservas.token.js,
 * con su propio `aud` y su propia llave (PRECIOS_TOKEN_SECRET). Un token inválido,
 * vencido o de otra tienda no es un error: se ignora y se cobra el precio actual.
 */

const AUDIENCE = "precio-congelado";
export const MINUTOS_PRECIO_ASEGURADO = 15;
// Gracia para el viaje del pedido: quien confirma justo a los 15 minutos (CA-8.3) no pierde el precio.
const TOLERANCIA_SEGUNDOS = 60;

// En producción config/index.js exige la llave al arrancar. Sin ella (desarrollo) no
// se asegura nada: se cobra el precio del momento, como antes de C6.
const secretKey = (secret = config.precios.tokenSecret) => (secret ? new TextEncoder().encode(secret) : null);

/**
 * @param {{ tiendaId: string, lineas: Array<{ productoId: string, varianteId: string|null,
 *   unitario: number, regular: number, origen: string, campana?: object|null }> }} datos
 *   precios en céntimos, tal como los da precioVigente.
 * @param {{ secret?: string, ahora?: Date }} [opts] - Para tests.
 * @returns {Promise<{ token: string, vence: string }|null>} `vence` en ISO (UTC); null sin llave.
 */
export async function firmar({ tiendaId, lineas }, opts = {}) {
  const key = secretKey(opts.secret);
  if (!key) return null;
  const ahora = opts.ahora ?? new Date();
  const emitido = Math.floor(ahora.getTime() / 1000);
  const vence = emitido + MINUTOS_PRECIO_ASEGURADO * 60;
  const token = await new SignJWT({
    tid: tiendaId,
    lineas: lineas.map(({ productoId, varianteId, unitario, regular, origen, campana }) => ({
      productoId, varianteId: varianteId ?? null, unitario, regular, origen, campana: campana ?? null
    }))
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt(emitido)
    .setExpirationTime(vence)
    .sign(key);
  return { token, vence: new Date(vence * 1000).toISOString() };
}

/**
 * @param {string|null|undefined} token
 * @param {string} tiendaId - La tienda del pedido: un token de otra tienda no vale.
 * @param {{ secret?: string, ahora?: Date }} [opts]
 * @returns {Promise<Array<{ productoId, varianteId, unitario, regular, origen, campana }>|null>}
 *   las líneas firmadas; null si no hay token o no vale (alterado, vencido, de otra tienda o de otro uso).
 */
export async function verificar(token, tiendaId, opts = {}) {
  const key = secretKey(opts.secret);
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      audience: AUDIENCE,
      algorithms: ["HS256"],
      clockTolerance: TOLERANCIA_SEGUNDOS,
      ...(opts.ahora && { currentDate: opts.ahora })
    });
    if (payload.tid !== tiendaId || !Array.isArray(payload.lineas)) return null;
    return payload.lineas;
  } catch {
    return null;
  }
}
