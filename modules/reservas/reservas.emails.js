import config from "../../config/index.js";
import { escapeHtml } from "../../services/email.service.js";

/**
 * Correos del mini booking (spec "Avisos" en plan.md). Reciben la reserva ya
 * serializada (serializeReservaStore / serializeReservaAdmin). Nunca llevan
 * datos de pago en el correo de aceptación: se pagan desde el link, donde los
 * datos están siempre vigentes.
 */

const ADMIN_URL = config.frontendUrl || "http://localhost:4200";
const e = escapeHtml;

const formatoFechaHora = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
export const fechaHora = (v) => (v ? formatoFechaHora.format(new Date(v)) : "—");
const soles = (n) => `S/ ${Number(n ?? 0).toFixed(2)}`;

function layout({ titulo, intro, cuerpo = "", pie }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr><td style="padding: 30px 32px 10px;">
            <h1 style="margin: 0 0 12px; font-size: 21px; font-weight: 600; color: #1a1a1a;">${titulo}</h1>
            ${intro}
          </td></tr>
          <tr><td style="padding: 10px 32px 26px;">${cuerpo}</td></tr>
          <tr><td style="padding: 18px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">${pie}</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

const texto = (html) => `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #4a4a4a;">${html}</p>`;

const boton = (url, etiqueta) => `
  <p style="margin: 20px 0 0; text-align: center;">
    <a href="${url}" style="display: inline-block; padding: 12px 26px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">${etiqueta}</a>
  </p>`;

const fila = (etiqueta, valor) => `
  <tr>
    <td style="padding: 6px 10px; width: 40%; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${etiqueta}</td>
    <td style="padding: 6px 10px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f1f5f9;">${valor}</td>
  </tr>`;

const esTour = (r) => r.tipo === "tour";
const esEvento = (r) => r.tipo === "evento";
const hora = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

/** Cómo se nombra al negocio y al inicio del servicio en cada vertical. */
const voz = (r) => (esEvento(r)
  ? { Negocio: "El organizador", alNegocio: "al organizador", enNegocio: "en el lugar", inicio: "el inicio de la función", conf: "tu compra" }
  : esTour(r)
  ? { Negocio: "La agencia", alNegocio: "a la agencia", enNegocio: "en destino", inicio: "la hora de salida", conf: "la disponibilidad de la salida" }
  : { Negocio: "El hotel", alNegocio: "al hotel", enNegocio: "en el hotel", inicio: "la hora de ingreso", conf: "la disponibilidad" });

function textoPersonas(r) {
  if (esTour(r)) return (r.pasajeros ?? []).map(p => `${p.cantidad} ${p.nombre.toLowerCase()}`).join(", ") || "—";
  if (esEvento(r)) return (r.entradas ?? []).map(e => `${e.nombre} × ${e.cantidad}`).join(", ") || "—";
  return `${r.adultos} ${r.adultos === 1 ? "adulto" : "adultos"}${r.ninos ? `, ${r.ninos} ${r.ninos === 1 ? "niño" : "niños"}` : ""}`;
}

/** Resumen de la estadía o del tour, igual en todos los correos. */
function resumen(r) {
  const detalle = esEvento(r)
    ? fila("Evento", e(r.producto.nombre ?? "—")) +
      fila("Función", e(`${fechaHora(r.inicio)}${r.evento?.funcion ? ` · ${r.evento.funcion}` : ""}`)) +
      (r.evento?.lugar ? fila("Lugar", e(r.evento.lugar)) : "") +
      fila("Entradas", e(textoPersonas(r)))
    : esTour(r)
    ? fila("Tour", e(r.producto.nombre ?? "—")) +
      fila("Salida", e(fechaHora(r.inicio))) +
      (r.tour?.puntoEncuentro ? fila("Punto de encuentro", e(r.tour.puntoEncuentro)) : "") +
      fila("Pasajeros", e(textoPersonas(r)))
    : fila("Habitación", e(r.producto.nombre ?? "—")) +
      fila("Estadía", e(r.modalidad.etiqueta)) +
      fila("Ingreso", e(fechaHora(r.inicio))) +
      fila("Salida", e(fechaHora(r.fin))) +
      fila("Personas", e(textoPersonas(r)));
  return `
  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
    ${fila("Código de reserva", `<strong>${e(r.codigo)}</strong>`)}
    ${detalle}
    ${fila("Total", `<strong>${soles(r.total)}</strong>`)}
  </table>`;
}

/** Al cliente, apenas envía la solicitud. */
export function solicitudRecibidaEmail(r, url) {
  return {
    subject: `Recibimos tu solicitud de reserva ${r.codigo} — ${r.negocio.nombre}`,
    html: layout({
      titulo: "Recibimos tu solicitud de reserva",
      intro:
        texto(`Hola ${e(r.titular.nombres)}, enviamos tu solicitud a <strong>${e(r.negocio.nombre)}</strong>. ${voz(r).Negocio} confirmará ${voz(r).conf} y te avisaremos por este medio.`) +
        texto(`Si no la confirma antes de ${voz(r).inicio}, la solicitud se anula sola. Puedes seguir el estado desde el botón de abajo.`),
      cuerpo: resumen(r) + boton(url, "Ver mi reserva"),
      pie: "Todavía no tienes una reserva confirmada: esto es una solicitud."
    })
  };
}

/** Al comprador de entradas: el cupo está apartado, falta pagar. */
export function compraPendienteEmail(r, url) {
  const hasta = r.evento?.apartadoHasta ? hora.format(new Date(r.evento.apartadoHasta)) : null;
  return {
    subject: `Apartamos tus entradas ${r.codigo} — completa el pago`,
    html: layout({
      titulo: "Apartamos tus entradas",
      intro:
        texto(`Hola ${e(r.titular.nombres)}, tus entradas para <strong>${e(r.producto.nombre ?? "")}</strong> están apartadas. Para confirmarlas, paga <strong>${soles(r.montoAPagar)}</strong> y sube la captura desde el link${hasta ? ` antes de las <strong>${hasta}</strong>` : ""}.`) +
        texto("Si no subes la captura a tiempo, las entradas vuelven a la venta."),
      cuerpo: resumen(r) + boton(url, "Pagar y subir mi captura"),
      pie: "Tu compra se confirma cuando el organizador verifica el pago."
    })
  };
}

/** Al negocio: nueva solicitud. */
export function nuevaSolicitudEmail(r) {
  return {
    subject: esTour(r)
      ? `🧭 Nueva solicitud ${r.codigo}: ${r.producto.nombre} · ${r.personas} pax · salida ${fechaHora(r.inicio)}`
      : `🛎️ Nueva solicitud ${r.codigo}: ${r.modalidad.etiqueta} · ingreso ${fechaHora(r.inicio)}`,
    html: layout({
      titulo: "Tienes una nueva solicitud de reserva",
      intro:
        texto(`<strong>${e(`${r.titular.nombres} ${r.titular.apellidos}`)}</strong> pide una reserva. WhatsApp: <strong>${e(r.contacto.whatsapp)}</strong>.`) +
        texto(`Respóndela antes de ${voz(r).inicio}: si no, se anula sola.`),
      cuerpo: resumen(r) + boton(`${ADMIN_URL}/reservas/${r.id}`, "Aceptar o rechazar"),
      pie: "Recibiste este correo porque tu negocio recibe reservas desde su vitrina web."
    })
  };
}

/** Al cliente: aceptada, toca pagar. */
export function aceptadaEmail(r, url) {
  const v = voz(r);
  const ajuste = r.ajuste ? texto(`${v.Negocio} ajustó el total: <em>${e(r.ajuste.motivo)}</em>.`) : "";
  const saldo = r.saldoDestino > 0 ? texto(`El saldo de <strong>${soles(r.saldoDestino)}</strong> se paga ${v.enNegocio}.`) : "";
  return {
    subject: `Tu reserva ${r.codigo} fue aceptada: completa el pago`,
    html: layout({
      titulo: "¡Tu solicitud fue aceptada!",
      intro:
        texto(`Hola ${e(r.titular.nombres)}, <strong>${e(r.negocio.nombre)}</strong> tiene disponibilidad. Para confirmar, paga <strong>${soles(r.montoAPagar)}</strong> antes de ${v.inicio} y sube la captura desde el link.`) +
        ajuste + saldo,
      cuerpo: resumen(r) + boton(url, "Pagar y subir mi captura"),
      pie: `Si no pagas antes de ${v.inicio}, la reserva se anula.`
    })
  };
}

/** Al cliente: rechazada. */
export function rechazadaEmail(r, url) {
  return {
    subject: `Tu solicitud ${r.codigo} no pudo ser aceptada — ${r.negocio.nombre}`,
    html: layout({
      titulo: "Tu solicitud no pudo ser aceptada",
      intro:
        texto(`Hola ${e(r.titular.nombres)}, <strong>${e(r.negocio.nombre)}</strong> no tiene disponibilidad para tu solicitud.`) +
        (r.motivoRechazo ? texto(`Motivo: <em>${e(r.motivoRechazo)}</em>`) : "") +
        texto(`Puedes elegir otra fecha o escribirle ${voz(r).alNegocio} por WhatsApp.`),
      cuerpo: resumen(r) + boton(url, "Ver detalles"),
      pie: "No se realizó ningún cobro."
    })
  };
}

/** Al negocio: el cliente subió la captura. */
export function pagoSubidoEmail(r) {
  return {
    subject: `💸 Pago por verificar en la reserva ${r.codigo}`,
    html: layout({
      titulo: "Un cliente subió su comprobante de pago",
      intro:
        texto(`<strong>${e(`${r.titular.nombres} ${r.titular.apellidos}`)}</strong> pagó <strong>${soles(r.montoAPagar)}</strong> y subió la captura.`) +
        texto("Verifica en tu app del banco que el dinero llegó y confirma la reserva."),
      cuerpo: resumen(r) + boton(`${ADMIN_URL}/reservas/${r.id}`, "Verificar el pago"),
      pie: "Recibiste este correo porque tu negocio recibe reservas desde su vitrina web."
    })
  };
}

/** Al cliente: confirmada (spec R8). */
export function confirmadaEmail(r, url) {
  const enHotel = r.comprobanteEn === "en_el_servicio";
  const evento = esEvento(r);
  const lugar = evento ? r.evento?.lugar ?? r.producto.nombre : r.negocio.nombre;
  const direccion = evento ? r.evento?.direccion : r.negocio.direccion;
  return {
    subject: evento ? `✅ Entradas confirmadas ${r.codigo} — ${r.producto.nombre}` : `✅ Reserva confirmada ${r.codigo} — ${r.negocio.nombre}`,
    html: layout({
      titulo: evento ? "¡Tus entradas están confirmadas!" : "¡Tu reserva está confirmada!",
      intro:
        texto(`Hola ${e(r.titular.nombres)}, te esperamos en <strong>${e(lugar)}</strong>${direccion ? ` (${e(direccion)})` : ""}.`) +
        texto(`${enHotel ? "Pagado a cuenta" : "Pagado"}: <strong>${soles(r.montoPagado)}</strong>.${r.saldoDestino > 0 ? ` Saldo a pagar ${voz(r).enNegocio}: <strong>${soles(r.saldoDestino)}</strong>.` : ""}`) +
        (enHotel && !esTour(r) && !evento ? texto("Los consumos durante tu estadía se pagan en el hotel. Tu boleta o factura se entrega al finalizar tu estadía.") : "") +
        (r.modalidad?.tipo === "horas" ? texto(`Tu estadía es de ${e(fechaHora(r.inicio))} a ${e(fechaHora(r.fin))}. Si llegas más tarde, la hora de salida no cambia.`) : "") +
        (r.tour?.recojo ? texto(`<strong>Recojo:</strong> ${e(r.tour.recojo)}`) : "") +
        (r.instrucciones ? texto(`<strong>Importante:</strong> ${e(r.instrucciones)}`) : ""),
      cuerpo: resumen(r) + boton(url, "Ver mi confirmación"),
      pie: esEvento(r) ? "Presenta esta confirmación o tu código de compra y tu documento en el ingreso."
        : esTour(r) ? "Presenta esta confirmación o tu código de reserva en la salida." : "Presenta esta confirmación o tu código de reserva al llegar."
    })
  };
}
