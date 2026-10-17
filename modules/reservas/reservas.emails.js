import config from "../../config/index.js";
import { escapeHtml } from "../../services/email.service.js";
import { clave } from "../idiomas/clave.js";
import { rellenar, TRADUCTOR_BASE } from "../idiomas/traductor.js";
import { fechaCortaLocal } from "./textos-fecha.js";
import { textoPlano } from "../../utils/texto-plano.js";

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
const e = escapeHtml;
const soles = (n) => `S/ ${Number(n ?? 0).toFixed(2)}`;
const b = (html) => `<strong>${html}</strong>`;

/** Texto HTML traducido: plantilla escapada + valores (`params`) ya listos para HTML. */
const html = (t, k, params) => rellenar(e(t.plantilla(k)), params);

const hora = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
const partesLima = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
const DIAS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const DIAS_CORTOS = [
  clave("lun|día corto"), clave("mar|día corto"), clave("mié|día corto"), clave("jue|día corto"),
  clave("vie|día corto"), clave("sáb|día corto"), clave("dom|día corto")
];

/** "jue, 24/09, 14:00" en español, "Thu, Sep 24, 14:00" en inglés. */
export function fechaHora(v, t = TRADUCTOR_BASE) {
  if (!v) return "—";
  const d = new Date(v);
  const p = Object.fromEntries(partesLima.formatToParts(d).map((x) => [x.type, x.value]));
  return t(clave("{dia}, {fecha}, {hora}|fecha y hora"), {
    dia: t(DIAS_CORTOS[DIAS[p.weekday]]), fecha: fechaCortaLocal(t, `${p.year}-${p.month}-${p.day}`), hora: hora.format(d)
  });
}

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

const texto = (contenido) => `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #4a4a4a;">${contenido}</p>`;

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
const esLocal = (r) => r.tipo === "local";
const esCancha = (r) => r.tipo === "cancha";

// ── Cómo se nombra al negocio y al inicio del servicio en cada vertical ──

const VOZ = {
  evento: { Negocio: clave("El organizador|voz"), alNegocio: clave("al organizador|voz"), enNegocio: clave("en el lugar|voz"), inicio: clave("el inicio de la función|voz"), conf: clave("tu compra|voz") },
  local: { Negocio: clave("El local|voz"), alNegocio: clave("al local|voz"), enNegocio: clave("en el local|voz"), inicio: clave("la fecha del evento|voz"), conf: clave("la fecha|voz") },
  cancha: { Negocio: clave("La cancha|voz"), alNegocio: clave("a la cancha|voz"), enNegocio: clave("en la cancha|voz"), inicio: clave("la hora del partido|voz"), conf: clave("el horario|voz") },
  tour: { Negocio: clave("La agencia|voz"), alNegocio: clave("a la agencia|voz"), enNegocio: clave("en destino|voz"), inicio: clave("la hora de salida|voz"), conf: clave("la disponibilidad de la salida|voz") }
};
// Hotel: según el tipo de alojamiento (hospedaje-completo B1). Un hostal no es "el hotel".
const VOZ_ALOJAMIENTO = {
  hotel: { Negocio: clave("El hotel|voz"), alNegocio: clave("al hotel|voz"), enNegocio: clave("en el hotel|voz") },
  hostal: { Negocio: clave("El hostal|voz"), alNegocio: clave("al hostal|voz"), enNegocio: clave("en el hostal|voz") },
  casa: { Negocio: clave("La casa|voz"), alNegocio: clave("a la casa|voz"), enNegocio: clave("en la casa|voz") },
  apart: { Negocio: clave("El apart|voz"), alNegocio: clave("al apart|voz"), enNegocio: clave("en el apart|voz") },
  lodge: { Negocio: clave("El lodge|voz"), alNegocio: clave("al lodge|voz"), enNegocio: clave("en el lodge|voz") },
  posada: { Negocio: clave("La posada|voz"), alNegocio: clave("a la posada|voz"), enNegocio: clave("en la posada|voz") }
};
const VOZ_HOTEL = { inicio: clave("la hora de ingreso|voz"), conf: clave("la disponibilidad|voz") };

function voz(r, t) {
  const claves = VOZ[r.tipo] ?? { ...(VOZ_ALOJAMIENTO[r.negocio?.alojamiento] ?? VOZ_ALOJAMIENTO.hotel), ...VOZ_HOTEL };
  return Object.fromEntries(Object.entries(claves).map(([k, v]) => [k, e(t(v))]));
}

function textoPersonas(r, t) {
  if (esTour(r)) return (r.pasajeros ?? []).map((p) => `${p.cantidad} ${p.nombre.toLowerCase()}`).join(", ") || "—";
  if (esEvento(r)) return (r.entradas ?? []).map((x) => `${x.nombre} × ${x.cantidad}`).join(", ") || "—";
  const plural = (n, uno, varios) => t(n === 1 ? uno : varios, { n });
  const adultos = plural(r.adultos, clave("{n} adulto"), clave("{n} adultos"));
  return r.ninos ? `${adultos}, ${plural(r.ninos, clave("{n} niño"), clave("{n} niños"))}` : adultos;
}

function estadia(r, t) {
  if (r.modalidad?.tipo === "horas") return t(clave("{n} horas"), { n: r.horas ?? "" });
  return t(r.noches === 1 ? clave("{n} noche") : clave("{n} noches"), { n: r.noches });
}

/** Resumen de la reserva, igual en todos los correos. */
function resumen(r, t) {
  const f = (v) => e(fechaHora(v, t));
  const et = (k) => e(t(k));
  const l = r.local;
  const detalle = esLocal(r)
    ? fila(et(clave("Salón")), e(l?.salon ?? r.producto.nombre ?? "—")) +
      fila(et(clave("Evento")), e(`${l?.tipoEventoEtiqueta ?? "—"}${l?.agasajado ? ` · ${l.agasajado}` : ""}`)) +
      fila(et(clave("Fecha")), `${f(r.inicio)}${l?.turno?.nombre ? ` · ${html(t, clave("turno {nombre}"), { nombre: e(l.turno.nombre) })}` : ""} · ${e(t(clave("hasta las {hora}"), { hora: l?.horaFin ?? hora.format(new Date(r.fin)) }))}`) +
      fila(et(clave("Invitados")), e(String(l?.invitados ?? "—"))) +
      (l?.paquete?.nombre ? fila(et(clave("Paquete")), e(l.paquete.nombre)) : "") +
      (r.montoAPagar ? fila(et(clave("Separación")), soles(r.montoAPagar)) : "") +
      (l?.garantia ? fila(et(clave("Garantía")), soles(l.garantia)) : "")
    : esEvento(r)
    ? fila(et(clave("Evento")), e(r.producto.nombre ?? "—")) +
      fila(et(clave("Función")), `${f(r.inicio)}${r.evento?.funcion ? ` · ${e(r.evento.funcion)}` : ""}`) +
      (r.evento?.lugar ? fila(et(clave("Lugar")), e(r.evento.lugar)) : "") +
      fila(et(clave("Entradas")), e(textoPersonas(r, t)))
    : esCancha(r)
    ? fila(et(clave("Cancha")), e(`${r.cancha?.nombre ?? r.producto.nombre ?? "—"}${r.cancha?.formato ? ` · ${r.cancha.formato}` : ""}`)) +
      fila(et(clave("Horario")), e(t(clave("{inicio} a {fin}|horario"), { inicio: fechaHora(r.inicio, t), fin: hora.format(new Date(r.fin)) }))) +
      (r.montoAPagar && r.montoAPagar < r.total
        ? fila(et(clave("Adelanto")), soles(r.montoAPagar)) + fila(et(clave("Saldo en la cancha")), soles(r.total - r.montoAPagar))
        : "")
    : esTour(r)
    ? fila(et(clave("Tour")), e(r.producto.nombre ?? "—")) +
      fila(et(clave("Salida|tour")), f(r.inicio)) +
      (r.tour?.puntoEncuentro ? fila(et(clave("Punto de encuentro")), e(r.tour.puntoEncuentro)) : "") +
      fila(et(clave("Pasajeros")), e(textoPersonas(r, t)))
    : fila(et(clave("Habitación")), e(`${r.habitaciones > 1 ? `${r.habitaciones} × ` : ""}${r.producto.nombre ?? "—"}`)) +
      fila(et(clave("Estadía")), e(estadia(r, t))) +
      fila(et(clave("Entrada|estadia")), f(r.inicio)) +
      fila(et(clave("Salida")), f(r.fin)) +
      fila(et(clave("Personas")), e(textoPersonas(r, t)));
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
    subject: esTour(r)
      ? `🧭 Nueva solicitud ${r.codigo}: ${r.producto.nombre} · ${r.personas} pax · salida ${fechaHora(r.inicio)}`
      : esLocal(r)
      ? `🎉 Nueva solicitud ${r.codigo}: ${r.local?.tipoEventoEtiqueta ?? "evento"} · ${r.local?.invitados ?? r.personas} invitados · ${fechaHora(r.inicio)}`
      : esCancha(r)
      ? `⚽ Nueva solicitud ${r.codigo}: ${r.cancha?.nombre ?? r.producto.nombre} · ${fechaHora(r.inicio)}`
      : `🛎️ Nueva solicitud ${r.codigo}: ${r.modalidad.etiqueta} · ingreso ${fechaHora(r.inicio)}`,
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
    subject: `${confirmada ? "✅ Nueva reserva confirmada" : "🛎️ Nueva reserva por pagar"} ${r.codigo}: ${esCancha(r) ? `${r.cancha?.nombre ?? r.producto.nombre} · ` : "ingreso "}${fechaHora(r.inicio)}`,
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

const NOMBRES_FUENTE = {
  google: "Google", booking: "Booking.com", tripadvisor: "Tripadvisor", airbnb: "Airbnb", facebook: "Facebook",
  getyourguide: "GetYourGuide", viator: "Viator"
};

/**
 * "¿Cómo te fue?" tras la estadía o el tour (hospedaje-completo C6), en el
 * idioma en que reservó. `externa` es la primera reseña en otro sitio que
 * configuró el negocio: se invita a dejarla también ahí.
 */
export function pedirResenaEmail({ nombre, negocio, producto, tipo = "hotel", externa = null, idioma }, url, t = TRADUCTOR_BASE) {
  const tour = tipo === "tour";
  const sitio = externa ? NOMBRES_FUENTE[externa.fuente] ?? externa.fuente : null;
  return {
    subject: t(tour ? clave("¿Cómo te fue con {negocio}?|tour") : clave("¿Cómo te fue con {negocio}?|estadía"), { negocio }),
    html: layout({
      lang: idioma,
      titulo: e(t(clave("¿Cómo te fue?"))),
      intro: texto(html(t, clave("Hola {nombre}, gracias por elegir {negocio}. Tu reseña toma un minuto y ayuda a otros viajeros a decidir."),
        { nombre: e(nombre), negocio: b(e(negocio)) }))
        + (producto ? texto(`${e(t(tour ? clave("Tu reserva|tour") : clave("Tu reserva|estadía")))}: ${b(e(producto))}`) : ""),
      cuerpo: boton(url, e(t(clave("Dejar mi reseña"))))
        + (externa ? texto(html(t, clave("¿Tienes un minuto más? Tu reseña en {sitio} nos ayuda mucho."),
          { sitio: `<a href="${e(externa.url)}" style="color: #2563eb;">${e(sitio)}</a>` })) : ""),
      pie: e(t(clave("Una reseña por reserva. El link es personal.")))
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
  // Canchas (alquiler-canchas R5): el horario queda apartado unos minutos mientras se paga el adelanto.
  if (esCancha(r)) {
    const hasta = r.cancha?.apartadoHasta ? hora.format(new Date(r.cancha.apartadoHasta)) : null;
    return {
      subject: t(clave("Separamos tu horario {codigo}: paga el adelanto"), { codigo: r.codigo }),
      html: layout({
        lang: r.idiomaHuesped,
        titulo: e(t(clave("Separamos tu horario"))),
        intro:
          texto(hasta
            ? html(t, clave("Hola {nombre}, tu horario en {negocio} está apartado hasta las {hora}. Para confirmarlo, paga el adelanto de {monto} y sube la captura desde el link."), { nombre, negocio, monto, hora: b(hasta) })
            : html(t, clave("Hola {nombre}, tu horario en {negocio} está apartado. Para confirmarlo, paga el adelanto de {monto} y sube la captura desde el link."), { nombre, negocio, monto })) +
          ajuste + saldo,
        cuerpo: resumen(r, t) + boton(url, e(t(clave("Pagar y subir mi captura")))),
        pie: e(t(clave("Si no subes la captura a tiempo, el horario se libera para otro equipo.")))
      })
    };
  }
  // Locales (alquiler-locales R8.3, R7): contrato primero, luego la separación; el resto en cuotas.
  const intro = esLocal(r)
    ? texto(r.local?.apartadoHasta
      ? html(t, clave("Hola {nombre}, {negocio} aceptó tu solicitud. Para separar la fecha, lee y acepta el contrato, y paga la separación de {monto} antes del {fecha}."), { nombre, negocio, monto, fecha: e(fechaHora(r.local.apartadoHasta, t)) })
      : html(t, clave("Hola {nombre}, {negocio} aceptó tu solicitud. Para separar la fecha, lee y acepta el contrato, y paga la separación de {monto}."), { nombre, negocio, monto })) +
      texto(e(t(clave("El resto se paga en cuotas según el plan de pagos que verás en el link.")))) + ajuste
    : texto(html(t, clave("Hola {nombre}, {negocio} tiene disponibilidad. Para confirmar, paga {monto} antes de {inicio} y sube la captura desde el link."), { nombre, negocio, monto, inicio: v.inicio })) +
      ajuste + saldo;
  return {
    subject: t(clave("Tu reserva {codigo} fue aceptada: completa el pago"), { codigo: r.codigo }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: e(t(clave("¡Tu solicitud fue aceptada!"))),
      intro,
      cuerpo: resumen(r, t) + boton(url, e(t(esLocal(r) ? clave("Ver contrato y pagar") : clave("Pagar y subir mi captura")))),
      pie: esLocal(r)
        ? e(t(clave("Si no pagas la separación a tiempo, la fecha se libera.")))
        : html(t, clave("Si no pagas antes de {inicio}, la reserva se anula."), { inicio: v.inicio })
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
  const evento = esEvento(r);
  const lugar = evento ? r.evento?.lugar ?? r.producto.nombre : r.negocio.nombre;
  const direccion = evento ? r.evento?.direccion : r.negocio.direccion;
  const pagado = esLocal(r)
    // Locales: lo pagado y lo que falta según el plan de pagos (R7.5).
    ? html(t, clave("Pagado: {pagado}. Saldo: {saldo}."), { pagado: b(soles(r.local?.resumen?.pagado)), saldo: b(soles(r.local?.resumen?.saldo)) }) +
      (r.local?.resumen?.proximaCuota
        ? ` ${html(t, clave("Próxima cuota: {monto} hasta el {fecha}."), { monto: soles(r.local.resumen.proximaCuota.monto), fecha: e(r.local.resumen.proximaCuota.venceEn.split("-").reverse().join("/")) })}`
        : "")
    : r.montoPagado > 0
      ? html(t, enHotel ? clave("Pagado a cuenta: {monto}.") : clave("Pagado: {monto}."), { monto: b(soles(r.montoPagado)) }) +
        (r.saldoDestino > 0 ? ` ${html(t, clave("Saldo a pagar {enNegocio}: {monto}."), { enNegocio: v.enNegocio, monto: b(soles(r.saldoDestino)) })}` : "")
      // Cobro en destino: nada pagado todavía, todo se paga al llegar.
      : html(t, clave("Pagas {monto} {enNegocio}."), { monto: b(soles(r.saldoDestino || r.total)), enNegocio: v.enNegocio });
  return {
    subject: evento
      ? t(clave("✅ Entradas confirmadas {codigo} — {evento}"), { codigo: r.codigo, evento: r.producto.nombre })
      : t(clave("✅ Reserva confirmada {codigo} — {negocio}"), { codigo: r.codigo, negocio: r.negocio.nombre }),
    html: layout({
      lang: r.idiomaHuesped,
      titulo: e(t(evento ? clave("¡Tus entradas están confirmadas!") : clave("¡Tu reserva está confirmada!"))),
      intro:
        texto(direccion
          ? html(t, clave("Hola {nombre}, te esperamos en {lugar} ({direccion})."), { nombre: e(r.titular.nombres), lugar: b(e(lugar)), direccion: e(direccion) })
          : html(t, clave("Hola {nombre}, te esperamos en {lugar}."), { nombre: e(r.titular.nombres), lugar: b(e(lugar)) })) +
        texto(pagado) +
        (r.exoneradoIgv ? texto(e(t(clave("Muestra tu pasaporte y la Tarjeta Andina de Migración (TAM) al llegar para mantener la exoneración del IGV.")))) : "") +
        (enHotel && !esTour(r) && !evento ? texto(html(t, clave("Los consumos durante tu estadía se pagan {enNegocio}. Tu boleta o factura se entrega al finalizar tu estadía."), { enNegocio: v.enNegocio })) : "") +
        (r.modalidad?.tipo === "horas" ? texto(html(t, clave("Tu estadía es de {inicio} a {fin}. Si llegas más tarde, la hora de salida no cambia."), { inicio: e(fechaHora(r.inicio, t)), fin: e(fechaHora(r.fin, t)) })) : "") +
        (r.tour?.recojo ? texto(`${b(e(t(clave("Recojo"))))}: ${e(r.tour.recojo)}`) : "") +
        // Las instrucciones vienen con formato (Markdown liviano): en el correo van sin símbolos, línea por línea.
        (r.instrucciones ? texto(`${b(e(t(clave("Importante"))))}: ${e(textoPlano(r.instrucciones)).replace(/\n/g, "<br>")}`) : ""),
      cuerpo: resumen(r, t) + boton(url, e(t(clave("Ver mi confirmación")))),
      pie: e(t(evento
        ? clave("Presenta esta confirmación o tu código de compra y tu documento en el ingreso.")
        : esTour(r) ? clave("Presenta esta confirmación o tu código de reserva en la salida.") : clave("Presenta esta confirmación o tu código de reserva al llegar.")))
    })
  };
}
