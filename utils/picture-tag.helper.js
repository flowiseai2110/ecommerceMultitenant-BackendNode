/**
 * Extrae las URLs públicas WebP y JPEG de un registro producto_imagenes.
 * Si la imagen fue subida antes de que existiera urlJpeg, usa la WebP como fallback.
 *
 * @param {{ url: string, urlJpeg?: string|null }} imagen
 * @returns {{ webp: string, jpeg: string }}
 */
export function getProductImageUrls(imagen) {
  return {
    webp: imagen.url,
    jpeg: imagen.urlJpeg ?? imagen.url,
  };
}

/**
 * Construye un <picture> con WebP + JPEG fallback, dimensiones explícitas
 * (previenen layout shift / CLS) y lazy loading por defecto.
 *
 * @param {string} webpUrl   - URL pública del archivo .webp en Supabase Storage
 * @param {string} jpegUrl   - URL pública del archivo .jpg  en Supabase Storage
 * @param {object} options
 * @param {number}  options.width     - Ancho explícito en px (requerido para evitar CLS)
 * @param {number}  options.height    - Alto explícito en px  (requerido para evitar CLS)
 * @param {string} [options.alt]      - Texto alternativo (default: "")
 * @param {string} [options.className]- Clase CSS aplicada al <img>
 * @param {string} [options.sizes]    - Atributo sizes para imágenes responsivas
 * @param {boolean}[options.priority] - true para imágenes above-the-fold: omite lazy, agrega fetchpriority="high"
 * @returns {string} HTML string listo para inyectar
 */
export function getPictureTag(webpUrl, jpegUrl, {
  width,
  height,
  alt = "",
  className = "",
  sizes = "",
  priority = false,
} = {}) {
  if (!webpUrl || !jpegUrl) {
    throw new Error("getPictureTag: webpUrl y jpegUrl son requeridos");
  }
  if (!width || !height) {
    throw new Error("getPictureTag: width y height son requeridos para prevenir layout shift");
  }

  const sizesAttr   = sizes     ? ` sizes="${esc(sizes)}"`         : "";
  const classAttr   = className ? ` class="${esc(className)}"`     : "";
  const loadingAttr = priority
    ? ` fetchpriority="high"`
    : ` loading="lazy"`;

  return [
    `<picture>`,
    `  <source type="image/webp" srcset="${esc(webpUrl)}"${sizesAttr}>`,
    `  <img src="${esc(jpegUrl)}" alt="${esc(alt)}" width="${width}" height="${height}"${loadingAttr} decoding="async"${classAttr}>`,
    `</picture>`,
  ].join("\n");
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
