import config from "../../config/index.js";
import { escapeHtml } from "../../services/email.service.js";
import { DEFINICION_QUEJA, DEFINICION_RECLAMO, ETIQUETAS, TEXTO_PLAZO, TEXTO_VIAS_ALTERNAS } from "./textos-legales.js";

/**
 * HTML de los correos del Libro de Reclamaciones. Todos comparten
 * `renderHojaHTML`: la copia de la hoja (Anexo I) que recibe el consumidor es
 * la misma que ve la tienda en la vista previa de la respuesta.
 *
 * Reciben la hoja ya serializada (serializeHojaAdmin): fechas en ISO.
 */

const FRONTEND_URL = config.frontendUrl || "http://localhost:4200";
const e = escapeHtml;
// Saltos de línea del consumidor → <br>, después de escapar.
const parrafo = (texto) => e(texto).replace(/\r?\n/g, "<br>");

const formatoFechaHora = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
});

export function fechaHoraLima(valor) {
  return valor ? formatoFechaHora.format(new Date(valor)) : "—";
}

/** "2026-10-27" → "27/10/2026" (sin zona: es una fecha del calendario de Lima). */
export function fechaCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function monto(hoja) {
  if (hoja.montoReclamado === null || hoja.montoReclamado === undefined) return "—";
  const simbolo = { PEN: "S/", USD: "$" }[hoja.moneda] || hoja.moneda;
  return `${simbolo} ${Number(hoja.montoReclamado).toFixed(2)}`;
}

const fila = (etiqueta, valor) => `
  <tr>
    <td style="padding: 6px 10px; width: 38%; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; vertical-align: top;">${etiqueta}</td>
    <td style="padding: 6px 10px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f1f5f9;">${valor}</td>
  </tr>`;

const seccion = (titulo, filas) => `
  <p style="margin: 22px 0 6px; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px;">${titulo}</p>
  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">${filas}</table>`;

/**
 * Hoja de Reclamación completa en el orden del Anexo I.
 * @param {object} hoja - serializeHojaAdmin
 */
export function renderHojaHTML(hoja) {
  const p = hoja.proveedor;
  const c = hoja.consumidor;
  return `
  <div style="border: 2px solid #1e293b; border-radius: 8px; padding: 18px;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top;">
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">LIBRO DE RECLAMACIONES</p>
          <p style="margin: 2px 0 0; font-size: 13px; color: #475569;">HOJA DE RECLAMACIÓN</p>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <p style="margin: 0; font-size: 13px; color: #475569;">N°</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">${e(hoja.numero)}</p>
        </td>
      </tr>
    </table>
    <p style="margin: 10px 0 0; font-size: 13px; color: #334155;">
      <strong>Fecha:</strong> ${fechaHoraLima(hoja.fechaRegistro)}<br>
      <strong>${e(p.razonSocial || p.nombre)}</strong>${p.ruc ? ` · RUC ${e(p.ruc)}` : ""}<br>
      ${p.direccion ? e(p.direccion) : ""}
    </p>

    ${seccion("1. Identificación del consumidor reclamante",
      fila("Nombre", e(`${c.nombres} ${c.apellidos}`)) +
      fila(e(ETIQUETAS.docTipo[c.docTipo] || c.docTipo), e(c.docNumero)) +
      fila("Domicilio", e(c.domicilio)) +
      fila("Teléfono", e(c.telefono || "—")) +
      fila("Correo", e(c.email)) +
      (c.esMenor
        ? fila("Padre, madre o apoderado", `${e(c.apoderado.nombre)}<br>${e(ETIQUETAS.docTipo[c.apoderado.docTipo] || c.apoderado.docTipo || "")} ${e(c.apoderado.docNumero)}`)
        : ""))}

    ${seccion("2. Identificación del bien contratado",
      fila("Tipo", e(ETIQUETAS.bienTipo[hoja.bien.tipo])) +
      fila("Monto reclamado", monto(hoja.bien)) +
      fila("Descripción", parrafo(hoja.bien.descripcion)) +
      (hoja.bien.numeroPedido ? fila("N° de pedido", e(hoja.bien.numeroPedido)) : ""))}

    ${seccion("3. Detalle de la reclamación y pedido del consumidor",
      fila("Tipo", `<strong>${e(ETIQUETAS.tipo[hoja.tipo])}</strong>`) +
      fila("Detalle", parrafo(hoja.detalle)) +
      fila("Pedido", parrafo(hoja.pedidoConsumidor)) +
      fila("Respuesta por", e(ETIQUETAS.medioRespuesta[hoja.medioRespuesta])))}

    ${hoja.respuesta
      ? seccion("4. Observaciones y acciones adoptadas por el proveedor",
        fila("Fecha de comunicación", fechaHoraLima(hoja.respuesta.fecha)) +
        fila("Respuesta", parrafo(hoja.respuesta.texto)) +
        (hoja.respuesta.accionAdoptada ? fila("Acción adoptada", parrafo(hoja.respuesta.accionAdoptada)) : ""))
      : ""}

    <p style="margin: 18px 0 0; font-size: 11px; line-height: 1.5; color: #64748b;">
      ${e(DEFINICION_RECLAMO)}<br>${e(DEFINICION_QUEJA)}<br><br>
      ${e(TEXTO_VIAS_ALTERNAS)}<br>${e(TEXTO_PLAZO)}
    </p>
  </div>`;
}

function layout({ titulo, intro, cuerpo, pie }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" style="width: 100%; max-width: 640px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 32px 10px;">
              <h1 style="margin: 0 0 12px; font-size: 21px; font-weight: 600; color: #1a1a1a;">${titulo}</h1>
              ${intro}
            </td>
          </tr>
          <tr><td style="padding: 10px 32px 26px;">${cuerpo}</td></tr>
          <tr>
            <td style="padding: 18px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">${pie}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

const boton = (url, texto) => `
  <p style="margin: 20px 0 0; text-align: center;">
    <a href="${url}" style="display: inline-block; padding: 12px 26px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">${texto}</a>
  </p>`;

const texto = (html) => `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #4a4a4a;">${html}</p>`;

/** Constancia para el consumidor (R4.2). */
export function constanciaConsumidorEmail(hoja, urlConstancia) {
  const tienda = hoja.proveedor.nombre;
  return {
    subject: `Constancia de tu ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} N° ${hoja.numero} — ${tienda}`,
    html: layout({
      titulo: `Registramos tu ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} N° ${e(hoja.numero)}`,
      intro:
        texto(`Hola ${e(hoja.consumidor.nombres)}, esta es la copia de la hoja que registraste en el Libro de Reclamaciones de <strong>${e(tienda)}</strong>.`) +
        texto(`La tienda debe responderte a más tardar el <strong>${fechaCorta(hoja.fechaLimite)}</strong> por ${e(ETIQUETAS.medioRespuesta[hoja.medioRespuesta].toLowerCase())}.`),
      cuerpo: renderHojaHTML(hoja) + boton(urlConstancia, "Ver mi hoja en línea"),
      pie: "Guarda este correo: es tu constancia. Para escribirle a la tienda, responde a este mensaje."
    })
  };
}

/** Aviso inmediato a la tienda (R7.2). */
export function avisoTiendaEmail(hoja) {
  const url = `${FRONTEND_URL}/libro-reclamaciones/${hoja.id}`;
  return {
    subject: `📕 Nuevo ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} N° ${hoja.numero} — responde antes del ${fechaCorta(hoja.fechaLimite)}`,
    html: layout({
      titulo: `Recibiste un${hoja.tipo === "queja" ? "a" : ""} ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} en tu Libro de Reclamaciones`,
      intro:
        texto(`<strong>${e(`${hoja.consumidor.nombres} ${hoja.consumidor.apellidos}`)}</strong> registró la hoja <strong>N° ${e(hoja.numero)}</strong>.`) +
        texto(`Por ley tienes <strong>15 días hábiles</strong> para responder: el plazo vence el <strong>${fechaCorta(hoja.fechaLimite)}</strong>. Responder tarde o no responder puede ser multado por Indecopi.`),
      cuerpo: renderHojaHTML(hoja) + boton(url, "Responder desde el panel"),
      pie: `Recibiste este correo porque tu tienda <strong>${e(hoja.proveedor.nombre)}</strong> recibió una hoja de reclamación.`
    })
  };
}

/** Respuesta de la tienda al consumidor (R6.5). `hoja.respuesta` ya debe venir. */
export function respuestaConsumidorEmail(hoja, urlConstancia) {
  const tienda = hoja.proveedor.nombre;
  return {
    subject: `Respuesta a tu ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} N° ${hoja.numero} — ${tienda}`,
    html: layout({
      titulo: `Respuesta a tu ${ETIQUETAS.tipo[hoja.tipo].toLowerCase()} N° ${e(hoja.numero)}`,
      intro:
        texto(`Hola ${e(hoja.consumidor.nombres)}, <strong>${e(tienda)}</strong> respondió la hoja que registraste el ${fechaHoraLima(hoja.fechaRegistro)}:`) +
        `<div style="margin: 14px 0; padding: 16px 18px; background: #f0f9ff; border-left: 4px solid #2563eb; border-radius: 6px; font-size: 15px; line-height: 1.6; color: #1e293b;">
          ${parrafo(hoja.respuesta.texto)}
          ${hoja.respuesta.accionAdoptada ? `<p style="margin: 12px 0 0;"><strong>Acción adoptada:</strong><br>${parrafo(hoja.respuesta.accionAdoptada)}</p>` : ""}
        </div>`,
      cuerpo: renderHojaHTML(hoja) + (urlConstancia ? boton(urlConstancia, "Ver mi hoja en línea") : ""),
      pie: `${e(TEXTO_VIAS_ALTERNAS)}<br>Para escribirle a la tienda, responde a este mensaje.`
    })
  };
}
