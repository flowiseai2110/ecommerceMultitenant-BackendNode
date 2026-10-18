import config from "../../config/index.js";
import { clave } from "../idiomas/clave.js";
import { TRADUCTOR_BASE } from "../idiomas/traductor.js";
import { textoPlano } from "../../utils/texto-plano.js";
import { b, e, fechaHora, fila, hora, html, soles, texto } from "./correo.comun.js";
import { CORREO_HOTEL } from "./hotel/correo.js";
import { CORREO_TOUR } from "./tours/correo.js";
import { CORREO_EVENTO } from "./eventos/correo.js";
import { CORREO_LOCAL } from "./locales/correo.js";
import { CORREO_CANCHA } from "./canchas/correo.js";

export { fechaHora } from "./correo.comun.js";

/**
 * Correos del mini booking (spec "Avisos" en plan.md). Reciben la reserva ya
 * serializada (serializeReservaStore / serializeReservaAdmin). Nunca llevan
 * datos de pago en el correo de aceptación: se pagan desde el link, donde los
 * datos están siempre vigentes.
 *
 * Idioma (docs/specs/idiomas D11, B7): los correos al cliente reciben el
 * traductor del idioma en que reservó (`traductorPara(tiendaId, r.idiomaHuesped)`)
 * y salen del catálogo de textos fijos; lo que no está traducido, en el idioma
 * base. Los correos al negocio van en el idioma base (el admin es en español).
 *
 * En el HTML se escapa la plantilla traducida (la escribe el dueño) y después
 * se insertan los valores, ya escapados o con su <strong>.
 */

const ADMIN_URL = config.frontendUrl || "http://localhost:4200";

function layout({ titulo, intro, cuerpo = "", pie, lang = "es" }) {
  return `
<!DOCTYPE html>
<html lang="${e(lang)}">
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

const boton = (url, etiqueta) => `
  <p style="margin: 20px 0 0; text-align: center;">
    <a href="${url}" style="display: inline-block; padding: 12px 26px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">${etiqueta}</a>
  </p>`;

/**
 * Lo propio de cada tipo de reserva en los correos (reservas/<rubro>/correo.js;
 * docs/specs/antipatrones 3b): voz, filas del resumen, asuntos al negocio y lo
 * que cambia en aceptada y confirmada. Un registro, no un if por tipo; un tipo
 * sin entrada falla el test de contrato (una por máquina de estados).
 */
export const CORREO_POR_TIPO = {
  hotel: CORREO_HOTEL,
  tour: CORREO_TOUR,
  evento: CORREO_EVENTO,
  local: CORREO_LOCAL,
  cancha: CORREO_CANCHA
};
const correoDe = (r) => CORREO_POR_TIPO[r.tipo] ?? CORREO_POR_TIPO.hotel;

/** Cómo se nombra al negocio y al inicio del servicio, ya traducido y escapado. */
function voz(r, t) {
  return Object.fromEntries(Object.entries(correoDe(r).voz(r)).map(([k, v]) => [k, e(t(v))]));
}

/** Resumen de la reserva, igual en todos los correos. */
function resumen(r, t) {
  const et = (k) => e(t(k));
  const detalle = correoDe(r).detalle(r, t);
  return `
  <table role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
    ${fila(et(clave("Código de reserva")), b(e(r.codigo)))}
    ${detalle}
    ${fila(et(clave("Total")), b(soles(r.total)))}
  </table>`;
}

/** Al cliente, apenas envía la solicitud. */
export function solicitudRecibidaEmail(r, url, t = TRADUCTOR_BASE) {
  const v = voz(r, t);
  return {
    subject: t(clave("Recibimos tu solicitud de reserva {codigo} — {negocio}"), { codigo: r.codigo, negocio: r.negocio.nombre }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: e(t(clave("Recibimos tu solicitud de reserva"))),
      intro:
        texto(html(t, clave("Hola {nombre}, enviamos tu solicitud a {negocio}. {Negocio} confirmará {conf} y te avisaremos por este medio."),
          { nombre: e(r.titular.nombres), negocio: b(e(r.negocio.nombre)), Negocio: v.Negocio, conf: v.conf })) +
        texto(html(t, clave("Si no la confirma antes de {inicio}, la solicitud se anula sola. Puedes seguir el estado desde el botón de abajo."), { inicio: v.inicio })),
      cuerpo: resumen(r, t) + boton(url, e(t(clave("Ver mi reserva")))),
      pie: e(t(clave("Todavía no tienes una reserva confirmada: esto es una solicitud.")))
    })
  };
}

/** Al comprador de entradas: el cupo está apartado, falta pagar. */
export function compraPendienteEmail(r, url, t = TRADUCTOR_BASE) {
  const hasta = r.evento?.apartadoHasta ? hora.format(new Date(r.evento.apartadoHasta)) : null;
  const params = { nombre: e(r.titular.nombres), evento: b(e(r.producto.nombre ?? "")), monto: b(soles(r.montoAPagar)), hora: b(hasta) };
  return {
    subject: t(clave("Apartamos tus entradas {codigo} — completa el pago"), { codigo: r.codigo }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: e(t(clave("Apartamos tus entradas"))),
      intro:
        texto(hasta
          ? html(t, clave("Hola {nombre}, tus entradas para {evento} están apartadas. Para confirmarlas, paga {monto} y sube la captura desde el link antes de las {hora}."), params)
          : html(t, clave("Hola {nombre}, tus entradas para {evento} están apartadas. Para confirmarlas, paga {monto} y sube la captura desde el link."), params)) +
        texto(e(t(clave("Si no subes la captura a tiempo, las entradas vuelven a la venta.")))),
      cuerpo: resumen(r, t) + boton(url, e(t(clave("Pagar y subir mi captura")))),
      pie: e(t(clave("Tu compra se confirma cuando el organizador verifica el pago.")))
    })
  };
}

/** Al negocio: nueva solicitud (en el idioma base). */
export function nuevaSolicitudEmail(r) {
  const t = TRADUCTOR_BASE;
  return {
    subject: correoDe(r).asuntoSolicitud(r),
    html: layout({
      titulo: "Tienes una nueva solicitud de reserva",
      intro:
        texto(`<strong>${e(`${r.titular.nombres} ${r.titular.apellidos}`)}</strong> pide una reserva. WhatsApp: <strong>${e(r.contacto.whatsapp)}</strong>.`) +
        texto(`Respóndela antes de ${voz(r, t).inicio}: si no, se anula sola.`),
      cuerpo: resumen(r, t) + boton(`${ADMIN_URL}/reservas/${r.id}`, "Aceptar o rechazar"),
      pie: "Recibiste este correo porque tu negocio recibe reservas desde su vitrina web."
    })
  };
}

/**
 * Al negocio: reserva hecha con confirmación inmediata (pago directo). No hay
 * nada que aceptar: queda esperando el pago o, si se paga al llegar, confirmada.
 */
export function nuevaReservaEmail(r) {
  const confirmada = r.estado === "confirmada";
  return {
    subject: `${confirmada ? "✅ Nueva reserva confirmada" : "🛎️ Nueva reserva por pagar"} ${r.codigo}: ${correoDe(r).queNuevaReserva?.(r) ?? "ingreso "}${fechaHora(r.inicio)}`,
    html: layout({
      titulo: confirmada ? "Tienes una nueva reserva confirmada" : "Tienes una nueva reserva esperando el pago",
      intro:
        texto(`<strong>${e(`${r.titular.nombres} ${r.titular.apellidos}`)}</strong> reservó desde tu vitrina. WhatsApp: <strong>${e(r.contacto.whatsapp)}</strong>.`) +
        texto(confirmada
          ? "La reserva quedó confirmada y se paga al llegar."
          : "Cuando suba la captura del pago, verifícala para confirmar la reserva."),
      cuerpo: resumen(r, TRADUCTOR_BASE) + boton(`${ADMIN_URL}/reservas/${r.id}`, "Ver la reserva"),
      pie: "Recibiste este correo porque tu negocio recibe reservas desde su vitrina web."
    })
  };
}

/** Al cliente: aceptada, toca pagar. */
export function aceptadaEmail(r, url, t = TRADUCTOR_BASE) {
  const v = voz(r, t);
  const ajuste = r.ajuste ? texto(html(t, clave("{Negocio} ajustó el total: {motivo}."), { Negocio: v.Negocio, motivo: `<em>${e(r.ajuste.motivo)}</em>` })) : "";
  const saldo = r.saldoDestino > 0 ? texto(html(t, clave("El saldo de {monto} se paga {enNegocio}."), { monto: b(soles(r.saldoDestino)), enNegocio: v.enNegocio })) : "";
  const nombre = e(r.titular.nombres);
  const negocio = b(e(r.negocio.nombre));
  const monto = b(soles(r.montoAPagar));
  // Canchas y locales cambian el correo (horario apartado; contrato y separación).
  const propio = correoDe(r).aceptada?.({ r, t, v, nombre, negocio, monto, ajuste, saldo }) ?? {};
  return {
    subject: propio.subject ?? t(clave("Tu reserva {codigo} fue aceptada: completa el pago"), { codigo: r.codigo }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: propio.titulo ?? e(t(clave("¡Tu solicitud fue aceptada!"))),
      intro: propio.intro ??
        texto(html(t, clave("Hola {nombre}, {negocio} tiene disponibilidad. Para confirmar, paga {monto} antes de {inicio} y sube la captura desde el link."), { nombre, negocio, monto, inicio: v.inicio })) +
        ajuste + saldo,
      cuerpo: resumen(r, t) + boton(url, propio.boton ?? e(t(clave("Pagar y subir mi captura")))),
      pie: propio.pie ?? html(t, clave("Si no pagas antes de {inicio}, la reserva se anula."), { inicio: v.inicio })
    })
  };
}

/** Al cliente: rechazada. */
export function rechazadaEmail(r, url, t = TRADUCTOR_BASE) {
  return {
    subject: t(clave("Tu solicitud {codigo} no pudo ser aceptada — {negocio}"), { codigo: r.codigo, negocio: r.negocio.nombre }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: e(t(clave("Tu solicitud no pudo ser aceptada"))),
      intro:
        texto(html(t, clave("Hola {nombre}, {negocio} no tiene disponibilidad para tu solicitud."), { nombre: e(r.titular.nombres), negocio: b(e(r.negocio.nombre)) })) +
        (r.motivoRechazo ? texto(html(t, clave("Motivo: {motivo}"), { motivo: `<em>${e(r.motivoRechazo)}</em>` })) : "") +
        texto(html(t, clave("Puedes elegir otra fecha o escribirle {alNegocio} por WhatsApp."), { alNegocio: voz(r, t).alNegocio })),
      cuerpo: resumen(r, t) + boton(url, e(t(clave("Ver detalles")))),
      pie: e(t(clave("No se realizó ningún cobro.")))
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
      cuerpo: resumen(r, TRADUCTOR_BASE) + boton(`${ADMIN_URL}/reservas/${r.id}`, "Verificar el pago"),
      pie: "Recibiste este correo porque tu negocio recibe reservas desde su vitrina web."
    })
  };
}

/** Al cliente: confirmada (spec R8). */
export function confirmadaEmail(r, url, t = TRADUCTOR_BASE) {
  const v = voz(r, t);
  const enHotel = r.comprobanteEn === "en_el_servicio";
  const correo = correoDe(r);
  // Eventos (asunto, lugar, pie), tours (pie) y locales (lo pagado según el plan) cambian partes.
  const propio = correo.confirmada?.(r, t, v) ?? {};
  const lugar = "lugar" in propio ? propio.lugar : r.negocio.nombre;
  const direccion = "direccion" in propio ? propio.direccion : r.negocio.direccion;
  const pagado = propio.pagado ?? (r.montoPagado > 0
    ? html(t, enHotel ? clave("Pagado a cuenta: {monto}.") : clave("Pagado: {monto}."), { monto: b(soles(r.montoPagado)) }) +
      (r.saldoDestino > 0 ? ` ${html(t, clave("Saldo a pagar {enNegocio}: {monto}."), { enNegocio: v.enNegocio, monto: b(soles(r.saldoDestino)) })}` : "")
    // Cobro en destino: nada pagado todavía, todo se paga al llegar.
    : html(t, clave("Pagas {monto} {enNegocio}."), { monto: b(soles(r.saldoDestino || r.total)), enNegocio: v.enNegocio }));
  return {
    subject: propio.subject ?? t(clave("✅ Reserva confirmada {codigo} — {negocio}"), { codigo: r.codigo, negocio: r.negocio.nombre }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: propio.titulo ?? e(t(clave("¡Tu reserva está confirmada!"))),
      intro:
        texto(direccion
          ? html(t, clave("Hola {nombre}, te esperamos en {lugar} ({direccion})."), { nombre: e(r.titular.nombres), lugar: b(e(lugar)), direccion: e(direccion) })
          : html(t, clave("Hola {nombre}, te esperamos en {lugar}."), { nombre: e(r.titular.nombres), lugar: b(e(lugar)) })) +
        texto(pagado) +
        (r.exoneradoIgv ? texto(e(t(clave("Muestra tu pasaporte y la Tarjeta Andina de Migración (TAM) al llegar para mantener la exoneración del IGV.")))) : "") +
        (enHotel && correo.avisaConsumos ? texto(html(t, clave("Los consumos durante tu estadía se pagan {enNegocio}. Tu boleta o factura se entrega al finalizar tu estadía."), { enNegocio: v.enNegocio })) : "") +
        (r.modalidad?.tipo === "horas" ? texto(html(t, clave("Tu estadía es de {inicio} a {fin}. Si llegas más tarde, la hora de salida no cambia."), { inicio: e(fechaHora(r.inicio, t)), fin: e(fechaHora(r.fin, t)) })) : "") +
        (r.tour?.recojo ? texto(`${b(e(t(clave("Recojo"))))}: ${e(r.tour.recojo)}`) : "") +
        // Las instrucciones vienen con formato (Markdown liviano): en el correo van sin símbolos, línea por línea.
        (r.instrucciones ? texto(`${b(e(t(clave("Importante"))))}: ${e(textoPlano(r.instrucciones)).replace(/\n/g, "<br>")}`) : ""),
      cuerpo: resumen(r, t) + boton(url, e(t(clave("Ver mi confirmación")))),
      pie: propio.pie ?? e(t(clave("Presenta esta confirmación o tu código de reserva al llegar.")))
    })
  };
}
