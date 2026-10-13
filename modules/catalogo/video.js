import { z } from "zod";

/**
 * Video de un producto (tour, salón...) a partir del link que pega el dueño
 * (docs/specs/video-producto). Lógica pura, sin BD, para poder testearla aislada.
 *
 * Modelo (sin DDL, sobre la columna JSONB existente):
 * - productos.metadata.video = { proveedor: "youtube", id: "dQw4w9WgXcQ", formato: "horizontal", link: "https://youtu.be/..." }
 *   Se guarda el video ya reconocido: el storefront nunca vuelve a interpretar
 *   texto del usuario. `link` (lo que pegó el dueño) solo se devuelve al admin. El link de embed se arma al serializar
 *   (urlEmbed), así un cambio de formato del proveedor no obliga a migrar datos.
 *
 * Cada proveedor es una estrategia: reconoce sus links y sabe armar el embed
 * (urlEmbed) o, si su reproductor no sirve dentro de otra web, el link para
 * abrir el video en la red (urlAbrir; urlEmbed null).
 * Proveedor nuevo = una entrada más en PROVEEDORES. El admin tiene una copia de
 * este registro para validar y previsualizar al pegar (src/app/shared/video).
 */

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ID_NUMERICO = /^\d{5,25}$/;
const ID_INSTAGRAM = /^[A-Za-z0-9_-]{5,40}$/;

/** Host sin "www." ni "m.", en minúsculas. */
const hostDe = (u) => u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
/** Segmentos del path sin vacíos: "/shorts/abc/" → ["shorts", "abc"]. */
const segmentosDe = (u) => u.pathname.split("/").filter(Boolean);

const youtube = {
  nombre: "youtube",
  reconocer(u) {
    const host = hostDe(u);
    const seg = segmentosDe(u);
    let id = null;
    let formato = "horizontal";
    if (host === "youtu.be") id = seg[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (seg[0] === "watch") id = u.searchParams.get("v");
      else if (["shorts", "embed", "live", "v"].includes(seg[0])) {
        id = seg[1];
        if (seg[0] === "shorts") formato = "vertical";
      }
    }
    return id && ID_YOUTUBE.test(id) ? { id, formato } : null;
  },
  urlEmbed: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`,
  miniatura: (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
};

const vimeo = {
  nombre: "vimeo",
  reconocer(u) {
    const host = hostDe(u);
    const seg = segmentosDe(u);
    let id = null;
    if (host === "vimeo.com") id = seg.find((s) => ID_NUMERICO.test(s));
    else if (host === "player.vimeo.com" && seg[0] === "video") id = seg[1];
    return id && ID_NUMERICO.test(id) ? { id, formato: "horizontal" } : null;
  },
  urlEmbed: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
  miniatura: () => null
};

const tiktok = {
  nombre: "tiktok",
  reconocer(u) {
    if (hostDe(u) !== "tiktok.com") return null;
    const seg = segmentosDe(u);
    // tiktok.com/@usuario/video/7234...  (los links cortos vm.tiktok.com no traen el id)
    const i = seg.indexOf("video");
    const id = i >= 0 ? seg[i + 1] : null;
    return id && ID_NUMERICO.test(id) ? { id, formato: "vertical" } : null;
  },
  urlEmbed: (id) => `https://www.tiktok.com/player/v1/${id}?autoplay=1&rel=0`,
  miniatura: () => null
};

const instagram = {
  nombre: "instagram",
  reconocer(u) {
    if (hostDe(u) !== "instagram.com") return null;
    const seg = segmentosDe(u);
    // instagram.com/reel/C8x.../ · /reels/... · /p/... · /tv/...
    const i = seg.findIndex((s) => ["reel", "reels", "p", "tv"].includes(s));
    const id = i >= 0 ? seg[i + 1] : null;
    return id && ID_INSTAGRAM.test(id) ? { id, formato: "vertical" } : null;
  },
  // Su embed es la publicación entera (me gusta, comentarios, scroll) y en el
  // celular casi nunca reproduce dentro: el ▶ abre el reel en Instagram (la app).
  urlEmbed: () => null,
  urlAbrir: (id) => `https://www.instagram.com/p/${id}/`,
  miniatura: () => null
};

const facebook = {
  nombre: "facebook",
  reconocer(u) {
    if (hostDe(u) !== "facebook.com") return null;
    const seg = segmentosDe(u);
    let id = null;
    let formato = "horizontal";
    if (seg[0] === "watch") id = u.searchParams.get("v");
    else if (seg[0] === "reel") { id = seg[1]; formato = "vertical"; }
    else {
      // facebook.com/<pagina>/videos/<id>/  ·  facebook.com/<pagina>/videos/<titulo>/<id>/
      const i = seg.indexOf("videos");
      if (i >= 0) id = seg.slice(i + 1).find((s) => ID_NUMERICO.test(s));
    }
    return id && ID_NUMERICO.test(id) ? { id, formato } : null;
  },
  urlEmbed: (id) =>
    `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/watch/?v=${id}`)}&show_text=false&autoplay=1`,
  miniatura: () => null
};

export const PROVEEDORES = [youtube, vimeo, tiktok, instagram, facebook];
export const NOMBRES_PROVEEDOR = PROVEEDORES.map((p) => p.nombre);
export const FORMATOS_VIDEO = ["horizontal", "vertical"];

export const MENSAJE_LINK_INVALIDO =
  "No reconocemos ese link. Pega el link de un video de YouTube, TikTok, Instagram, Facebook o Vimeo";

/**
 * Reconoce el link de un video. Acepta el link sin "https://" (como lo copian
 * desde el celular).
 * @param {string} link
 * @returns {{ proveedor: string, id: string, formato: "horizontal" | "vertical", link: string } | null}
 */
export function parsearVideo(link) {
  const texto = String(link ?? "").trim();
  if (!texto) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  for (const proveedor of PROVEEDORES) {
    const r = proveedor.reconocer(u);
    if (r) return { proveedor: proveedor.nombre, ...r, link: u.toString() };
  }
  return null;
}

/**
 * Campo `video` del formulario de producto: el link pegado. "" o null = quitar
 * el video. Sale ya reconocido ({ proveedor, id, formato, link }) o null.
 */
export const videoLinkSchema = z
  .union([z.string().max(500, "El link no puede exceder 500 caracteres"), z.null()])
  .transform((link, ctx) => {
    if (link == null || !link.trim()) return null;
    const video = parsearVideo(link);
    if (!video) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_LINK_INVALIDO });
      return z.NEVER;
    }
    return video;
  });

/**
 * metadata con el video puesto (o quitado si es null), sin tocar las demás
 * claves (metadata.opciones la mantiene producto-opciones.service).
 * @param {unknown} metadata
 * @param {{ proveedor: string, id: string, formato: string, link: string } | null} video
 */
export function metadataConVideo(metadata, video) {
  const base = { ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}) };
  if (video) base.video = video;
  else delete base.video;
  return base;
}

/** Video guardado y válido (metadata.video), o null si falta o está mal formado. */
function videoGuardado(valor) {
  if (!valor || typeof valor !== "object") return null;
  const proveedor = PROVEEDORES.find((p) => p.nombre === valor.proveedor);
  if (!proveedor || typeof valor.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(valor.id)) return null;
  return { proveedor, id: valor.id, formato: FORMATOS_VIDEO.includes(valor.formato) ? valor.formato : "horizontal" };
}

/**
 * Video para el storefront: el embed lo arma el proveedor (lista blanca de
 * dominios); la tienda nunca recibe texto libre para un iframe. Uno de los dos
 * viene: `embed` (se reproduce en la ficha) o `enlace` (el ▶ abre el video en
 * la red). miniatura null = la tienda usa la foto principal del ítem.
 * @param {unknown} valor - productos.metadata.video
 */
export function serializeVideoStore(valor) {
  const v = videoGuardado(valor);
  if (!v) return null;
  const embed = v.proveedor.urlEmbed(v.id);
  return {
    proveedor: v.proveedor.nombre,
    formato: v.formato,
    embed,
    enlace: embed ? null : v.proveedor.urlAbrir(v.id),
    miniatura: v.proveedor.miniatura(v.id)
  };
}

/**
 * Video para el admin: lo mismo que el store más el link que pegó el dueño,
 * que es lo que se muestra en el campo al editar.
 * @param {unknown} valor - productos.metadata.video
 */
export function serializeVideoAdmin(valor) {
  const store = serializeVideoStore(valor);
  if (!store) return null;
  return { ...store, link: typeof valor.link === "string" ? valor.link : null };
}
