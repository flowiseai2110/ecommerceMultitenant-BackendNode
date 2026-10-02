import sharp from "sharp";
import { ValidationError } from "../../utils/errors.js";

// Imágenes de widgets (stickers de campaña) subidas por la tienda (R5).
//
// El tipo se decide por el CONTENIDO del archivo (lo que sharp logra leer),
// no por el mimetype que manda el navegador, que es falsificable. Solo PNG y
// WebP: los dos formatos con transparencia que el storefront muestra tal
// cual. SVG nunca (puede llevar scripts), JPEG tampoco (sin transparencia,
// un sticker con fondo blanco se ve como un recuadro).

export const LADO_MAXIMO_WIDGET = 512;
export const MAX_BYTES_WIDGET = 1024 * 1024;
const FORMATOS_WIDGET = ["png", "webp"];

/**
 * Valida y normaliza la imagen de un widget: WebP de hasta 512 px por lado,
 * conservando la transparencia y sin agrandar las pequeñas. Devuelve el
 * buffer listo para subir.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
export async function normalizarImagenWidget(buffer) {
  let formato;
  try {
    ({ format: formato } = await sharp(buffer).metadata());
  } catch {
    formato = null;
  }
  if (!FORMATOS_WIDGET.includes(formato)) {
    throw new ValidationError("La imagen del widget debe ser PNG o WebP (con fondo transparente)");
  }

  return sharp(buffer)
    // Animados (WebP/APNG): solo el primer cuadro; la animación la pone el CSS.
    .resize(LADO_MAXIMO_WIDGET, LADO_MAXIMO_WIDGET, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, alphaQuality: 90 })
    .toBuffer();
}
