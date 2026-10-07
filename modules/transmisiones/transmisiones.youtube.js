import { ValidationError } from "../../utils/errors.js";
import { normalizeYoutube } from "../live/live.url.js";

/**
 * Plan Básico (R2.1): del enlace del live de YouTube saca el id del video para
 * incrustarlo. Valida con las mismas reglas del aviso de live (https, dominio
 * de YouTube) y además exige un video concreto: "@canal/live" no sirve porque
 * un live "no listado" no aparece en el canal.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const error = (message) => new ValidationError(message, { campo: "youtubeUrl", message });

export function youtubeVideoId(raw) {
  const input = String(raw ?? "").trim();
  // youtube.com/embed/ID no lo acepta el aviso de live; se pasa a watch?v=.
  const embed = input.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i);
  const normalizado = embed ? `https://www.youtube.com/watch?v=${embed[1]}` : normalizeYoutube(input);

  if (/\/@[^/]+\/live$/.test(normalizado)) {
    throw error("Pega el enlace del video del live (el que da YouTube al programarlo), no el de tu canal");
  }
  const url = new URL(normalizado);
  const id = url.searchParams.get("v") ?? url.pathname.match(/^\/live\/([^/]+)/)?.[1];
  if (!id || !ID_RE.test(id)) {
    throw error("No pude identificar el video en el enlace de YouTube");
  }
  return id;
}

export const urlVideoYoutube = (id) => (id ? `https://www.youtube.com/watch?v=${id}` : null);
