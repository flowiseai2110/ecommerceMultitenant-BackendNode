import { ValidationError } from "../../utils/errors.js";

/**
 * Validación y normalización de enlaces de live (TikTok / YouTube / Facebook).
 *
 * Reglas transversales:
 *  - Solo se acepta el protocolo https. Cualquier otro (http, ftp, javascript…)
 *    se rechaza.
 *  - Solo se aceptan los dominios de cada plataforma; cualquier otro dominio se
 *    rechaza.
 *  - Los errores llevan el mensaje en `details` porque el error middleware
 *    responde con `data: err.details` (no con `err.message`). Así el frontend
 *    recibe `{ campo, message }` y puede mostrarlo tal cual.
 */

/** Construye el ValidationError con el mensaje visible para el frontend. */
function errorLink(campo, message) {
  return new ValidationError(message, { campo, message });
}

/**
 * Parsea un enlace exigiendo https. Permite omitir el esquema (ej. "www.x.com/…"),
 * en cuyo caso se asume https://. Rechaza explícitamente cualquier esquema que no
 * sea https.
 */
function parsearHttps(input, campo, plataforma) {
  let candidato = input;
  const tieneEsquema = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidato);
  if (!tieneEsquema) candidato = `https://${candidato}`;

  let url;
  try {
    url = new URL(candidato);
  } catch {
    throw errorLink(campo, `El enlace de ${plataforma} no es válido`);
  }

  if (url.protocol !== "https:") {
    throw errorLink(campo, `El enlace de ${plataforma} debe usar https://`);
  }
  return url;
}

/**
 * TikTok — acepta:
 *  - "@usuario" o "usuario" (usuario suelto)
 *  - URLs de tiktok.com (o subdominios) que contengan @usuario en el path
 * Normaliza SIEMPRE a: https://www.tiktok.com/@usuario/live
 */
export function normalizeTiktok(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw errorLink("tiktok", "Ingresa tu usuario o enlace de TikTok");

  // ¿Parece un enlace? (esquema, www. o el dominio tiktok en el texto)
  const esEnlace = /:\/\//.test(input) || /^www\./i.test(input) || /tiktok\.com/i.test(input);

  if (!esEnlace) {
    // Usuario suelto: "@usuario" o "usuario".
    const usuario = input.replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{1,24}$/.test(usuario)) {
      throw errorLink(
        "tiktok",
        "El usuario de TikTok solo puede tener letras, números, punto y guion bajo"
      );
    }
    return `https://www.tiktok.com/@${usuario}/live`;
  }

  const url = parsearHttps(input, "tiktok", "TikTok");
  if (!/(^|\.)tiktok\.com$/i.test(url.hostname)) {
    throw errorLink("tiktok", "El enlace debe ser de tiktok.com");
  }

  const match = url.pathname.match(/@([A-Za-z0-9._]{1,24})/);
  if (!match) {
    throw errorLink(
      "tiktok",
      "No pude identificar el usuario en el enlace de TikTok (ej: https://www.tiktok.com/@usuario)"
    );
  }
  return `https://www.tiktok.com/@${match[1]}/live`;
}

/**
 * YouTube — acepta youtube.com/watch?v=, youtu.be/, youtube.com/live/,
 * m.youtube.com y youtube.com/@canal/live. Devuelve la URL normalizada.
 */
export function normalizeYoutube(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw errorLink("youtube", "Ingresa el enlace de YouTube");

  const url = parsearHttps(input, "youtube", "YouTube");
  const host = url.hostname.toLowerCase();
  const esYoutube = /(^|\.)youtube\.com$/.test(host) || host === "youtu.be";
  if (!esYoutube) {
    throw errorLink("youtube", "El enlace debe ser de YouTube");
  }

  // youtu.be/VIDEOID
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (!id) throw errorLink("youtube", "No pude identificar el video en el enlace de YouTube");
    return `https://www.youtube.com/watch?v=${id}`;
  }

  // youtube.com/watch?v=VIDEOID
  if (url.pathname === "/watch") {
    const v = url.searchParams.get("v");
    if (!v) throw errorLink("youtube", "El enlace de YouTube no incluye el video (?v=)");
    return `https://www.youtube.com/watch?v=${v}`;
  }

  // youtube.com/live/VIDEOID
  const live = url.pathname.match(/^\/live\/([^/]+)/);
  if (live) return `https://www.youtube.com/live/${live[1]}`;

  // youtube.com/@canal/live
  const canalLive = url.pathname.match(/^\/(@[^/]+)\/live\/?$/);
  if (canalLive) return `https://www.youtube.com/${canalLive[1]}/live`;

  throw errorLink(
    "youtube",
    "Usa un enlace de video o live de YouTube (watch?v=, live/, youtu.be o @canal/live)"
  );
}

/**
 * Facebook — acepta facebook.com, m.facebook.com y fb.watch. Normaliza el
 * subdominio móvil de facebook.com a www; conserva fb.watch tal cual.
 */
export function normalizeFacebook(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw errorLink("facebook", "Ingresa el enlace de Facebook");

  const url = parsearHttps(input, "facebook", "Facebook");
  const host = url.hostname.toLowerCase();
  const esFacebook = /(^|\.)facebook\.com$/.test(host) || host === "fb.watch";
  if (!esFacebook) {
    throw errorLink("facebook", "El enlace debe ser de Facebook (facebook.com o fb.watch)");
  }

  if (/(^|\.)facebook\.com$/.test(host)) {
    url.hostname = "www.facebook.com";
  }
  return url.href;
}

/**
 * Normaliza el conjunto de links que llega en un PUT /links o POST /start.
 * Solo procesa las claves presentes (undefined = no tocar). Un valor vacío o
 * null limpia ese link. Devuelve solo las claves procesadas, ya normalizadas.
 */
export function normalizarLinks({ tiktokUrl, youtubeUrl, facebookUrl } = {}) {
  const out = {};
  if (tiktokUrl !== undefined) out.tiktokUrl = tiktokUrl ? normalizeTiktok(tiktokUrl) : null;
  if (youtubeUrl !== undefined) out.youtubeUrl = youtubeUrl ? normalizeYoutube(youtubeUrl) : null;
  if (facebookUrl !== undefined) out.facebookUrl = facebookUrl ? normalizeFacebook(facebookUrl) : null;
  return out;
}

export default { normalizeTiktok, normalizeYoutube, normalizeFacebook, normalizarLinks };
