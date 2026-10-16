import { SignJWT, jwtVerify } from "jose";
import config from "../../config/index.js";

/**
 * Permiso firmado de vista previa de un idioma (docs/specs/idiomas, diseno.md
 * B3). Deja ver la tienda en un idioma que el dueño eligió pero todavía no
 * está publicado (P5), solo a quien tiene el token: el admin lo pide al abrir
 * el modo traducir y la tienda lo manda en la cabecera `X-Vista-Previa`. Sin
 * token, o con uno inválido, la tienda se comporta como siempre.
 *
 * Mismo patrón que los tokens de reserva (reservas.token.js), con su propio `aud`.
 */

const AUDIENCE = "idioma-vista-previa";
const DURACION = "1h";

/** Cabecera con que la tienda manda el permiso (en minúsculas, como la lee Express). */
export const CABECERA_VISTA_PREVIA = "x-vista-previa";

function clave(secret = config.idiomas.vistaPreviaSecret) {
  // Falla al usarse, no al importar: el resto de la API sigue funcionando.
  if (!secret) throw new Error("IDIOMAS_VISTA_PREVIA_SECRET (o RESERVAS_LINK_SECRET) no está configurado");
  return new TextEncoder().encode(secret);
}

/**
 * @param {{ tiendaId: string, idioma: string }} permiso
 * @param {{ secret?: string, duracion?: string }} [opts] - Para tests.
 * @returns {Promise<{ token: string, expiraEn: string }>}
 */
export async function firmarPermisoVistaPrevia({ tiendaId, idioma }, opts = {}) {
  const token = await new SignJWT({ idioma })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(tiendaId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.duracion ?? DURACION)
    .sign(clave(opts.secret));
  const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return { token, expiraEn: new Date(exp * 1000).toISOString() };
}

/**
 * El permiso de un token, o null si está alterado, vencido, es de otro uso o
 * falta. Nunca lanza: un permiso malo es lo mismo que no tener permiso.
 * @returns {Promise<{ tiendaId: string, idioma: string } | null>}
 */
export async function verificarPermisoVistaPrevia(token, opts = {}) {
  if (typeof token !== "string" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(opts.secret), { audience: AUDIENCE, algorithms: ["HS256"] });
    return typeof payload.sub === "string" && typeof payload.idioma === "string" ? { tiendaId: payload.sub, idioma: payload.idioma } : null;
  } catch {
    return null;
  }
}

/**
 * Decorator de la respuesta: lo que se arma con un permiso de vista previa no
 * se guarda en ninguna caché compartida, aunque la ruta pida `public` (si no,
 * un idioma sin publicar le llegaría a cualquiera con el mismo `?lang=`).
 */
export function sinCachePublica(res) {
  const set = res.set.bind(res);
  res.set = (campo, valor) => (typeof campo === "string" && campo.toLowerCase() === "cache-control"
    ? set("Cache-Control", "private, no-store")
    : set(campo, valor));
  set("Cache-Control", "private, no-store");
  res.vary?.(CABECERA_VISTA_PREVIA);
}
