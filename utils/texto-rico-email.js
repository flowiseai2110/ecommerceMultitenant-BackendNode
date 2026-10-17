import { Marked } from "marked";

/**
 * Texto con formato del dueño (Markdown liviano) → HTML para correos, con
 * estilos en línea porque los clientes de correo ignoran las hojas de estilo.
 * Mismas reglas que `textoRico` de FrontendStore shared/utils/texto-rico.ts:
 * el HTML escrito a mano se muestra como texto, sin imágenes, solo enlaces
 * http(s)/mailto/tel y las listas numeradas con el número escrito.
 */

const escapar = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ENLACE_PERMITIDO = /^(https?:|mailto:|tel:)/i;
const TEXTO = "font-size: 15px; line-height: 1.6; color: #4a4a4a;";
const P = `margin: 0 0 10px; ${TEXTO}`;

const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html({ text }) { return escapar(text); },
    image({ text }) { return escapar(text); },
    code({ text }) { return `<p style="${P}">${escapar(text)}</p>\n`; },
    paragraph({ tokens }) { return `<p style="${P}">${this.parser.parseInline(tokens)}</p>\n`; },
    heading({ tokens }) { return `<p style="${P} font-weight: 600;">${this.parser.parseInline(tokens)}</p>\n`; },
    blockquote({ tokens }) {
      return `<div style="margin: 0 0 10px; padding-left: 12px; border-left: 3px solid #cbd5e1;">${this.parser.parse(tokens)}</div>\n`;
    },
    list(token) {
      const etiqueta = token.ordered ? "ol" : "ul";
      const items = token.items.map((item) => {
        const li = this.listitem(item);
        const valor = token.ordered ? ` value="${parseInt(item.raw, 10)}"` : "";
        return li.replace(/^<li>/, `<li${valor} style="margin: 0 0 4px;">`);
      }).join("");
      return `<${etiqueta} style="margin: 0 0 10px; padding-left: 20px; ${TEXTO}">\n${items}</${etiqueta}>\n`;
    },
    link({ href, tokens }) {
      const texto = this.parser.parseInline(tokens);
      if (!ENLACE_PERMITIDO.test(href)) return texto;
      return `<a href="${escapar(href)}" style="color: #2563eb;">${texto}</a>`;
    }
  }
});

/** @param {string | null | undefined} texto @returns {string} */
export function textoRicoEmail(texto) {
  if (!texto?.trim()) return "";
  return md.parse(texto);
}
