import { Resend } from "resend";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

const FRONTEND_URL = config.frontendUrl || "http://localhost:4200";

/**
 * Genera el HTML del email de invitación
 */
function generateInvitationEmailHTML({ tiendaNombre, tiendaLogo, invitadorEmail, rol, mensaje, token, fechaExpiracion }) {
  const acceptUrl = `${FRONTEND_URL}/register/invite/${token}`;
  const fechaExp = new Date(fechaExpiracion).toLocaleDateString("es-PE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const rolesDescripcion = {
    owner: "Propietario - Acceso total a la tienda",
    admin: "Administrador - Gestión completa excepto eliminar tienda",
    editor: "Editor - Puede crear y editar contenido",
    viewer: "Visualizador - Solo lectura"
  };

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a ${tiendaNombre}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              ${tiendaLogo ? `<img src="${tiendaLogo}" alt="${tiendaNombre}" style="max-height: 60px; margin-bottom: 20px;">` : ""}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">
                Te han invitado a unirte a<br>
                <span style="color: #2563eb;">${tiendaNombre}</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a4a4a;">
                <strong>${invitadorEmail}</strong> te ha invitado a colaborar en <strong>${tiendaNombre}</strong>.
              </p>

              ${mensaje ? `
              <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 15px 20px; margin: 20px 0; border-radius: 0 4px 4px 0;">
                <p style="margin: 0; font-size: 14px; color: #64748b; font-style: italic;">
                  "${mensaje}"
                </p>
              </div>
              ` : ""}

              <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">
                  Tu rol asignado:
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e40af;">
                  ${rol.charAt(0).toUpperCase() + rol.slice(1)}
                </p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">
                  ${rolesDescripcion[rol] || ""}
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${acceptUrl}"
                   style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
                  Aceptar invitación
                </a>
              </div>

              <p style="margin: 25px 0 0; font-size: 13px; color: #94a3b8; text-align: center;">
                O copia y pega este enlace en tu navegador:<br>
                <a href="${acceptUrl}" style="color: #2563eb; word-break: break-all;">${acceptUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #eee;">
              <div style="background-color: #fef3c7; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 13px; color: #92400e;">
                  ⏰ Esta invitación expira el <strong>${fechaExp}</strong>
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                Si no esperabas esta invitación, puedes ignorar este correo.<br>
                No se realizará ninguna acción en tu cuenta.
              </p>
            </td>
          </tr>

          <!-- Brand Footer -->
          <tr>
            <td style="padding: 20px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Enviado por el equipo de ${tiendaNombre}<br>
                © ${new Date().getFullYear()} Todos los derechos reservados
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function hasResendApiKey() {
  return config.resend.apiKey && !config.resend.apiKey.startsWith("re_xxx");
}

/**
 * Envío base con Resend. En desarrollo con free tier redirige el email
 * al correo del desarrollador (RESEND_DEV_TO_EMAIL) prefijando el subject
 * con el destinatario real.
 */
async function deliverEmail({ to, subject, html }) {
  const isDev = config.nodeEnv !== "production";
  const devToEmail = config.resend.devToEmail;

  const toEmail = isDev && devToEmail ? devToEmail : to;
  const finalSubject = isDev && devToEmail ? `[DEV → ${to}] ${subject}` : subject;

  if (isDev && devToEmail) {
    logger.info(`📧 [DEV] Email redirigido de ${to} → ${devToEmail}`);
  }

  const resend = new Resend(config.resend.apiKey);

  const { data, error } = await resend.emails.send({
    from: config.resend.fromEmail,
    to: toEmail,
    subject: finalSubject,
    html
  });

  if (error) {
    logger.error("❌ Error enviando email con Resend:", error);
    throw new Error(`Error al enviar email: ${error.message}`);
  }

  logger.info(`📧 Email enviado a ${toEmail} | ID: ${data.id}`);
  return { success: true, messageId: data.id };
}

/**
 * Envía email de invitación usando Resend
 */
export async function sendInvitationEmail(invitacion, tienda, invitadorEmail) {
  const acceptUrl = `${FRONTEND_URL}/register/invite/${invitacion.token}`;
  const rol = invitacion.rolCodigo || invitacion.rol;

  const emailData = {
    tiendaNombre: tienda.nombre,
    tiendaLogo: tienda.logoUrl,
    invitadorEmail,
    rol,
    mensaje: invitacion.mensaje,
    token: invitacion.token,
    fechaExpiracion: invitacion.fechaExpiracion
  };

  // Sin API key configurada: solo loggear el link
  if (!hasResendApiKey()) {
    logger.warn("⚠️  RESEND_API_KEY no configurada. Configura tu API key en .env");
    logger.info(`📧 [DEV] Invitación para: ${invitacion.email}`);
    logger.info(`🔗 [DEV] Link de aceptación: ${acceptUrl}`);
    return { success: false, reason: "RESEND_API_KEY not configured" };
  }

  if (config.nodeEnv !== "production" && config.resend.devToEmail) {
    logger.info(`🔗 [DEV] Link de aceptación: ${acceptUrl}`);
  }

  return deliverEmail({
    to: invitacion.email,
    subject: `${invitadorEmail} te invitó a unirte a ${tienda.nombre}`,
    html: generateInvitationEmailHTML(emailData)
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const METODO_PAGO_LABELS = {
  billetera_digital: "Billetera digital (Yape/Plin)",
  transferencia: "Transferencia bancaria",
  contra_entrega: "Pago contra entrega",
  tarjeta: "Tarjeta",
  efectivo: "Efectivo"
};

function formatMetodoPago(tipo) {
  if (!tipo) return null;
  return METODO_PAGO_LABELS[tipo] || tipo.replace(/_/g, " ");
}

/**
 * Link wa.me hacia el cliente con mensaje precargado para coordinar el pago.
 * Los números del checkout se guardan como 9 dígitos (móvil Perú, sin código
 * de país) — wa.me requiere el código, así que se antepone 51 en ese caso.
 */
function buildWhatsAppClienteUrl(pedido, tienda, metodoPagoLabel) {
  const digits = String(pedido.cliente?.whatsappNumero || "").replace(/\D/g, "");
  if (!digits) return null;

  const numero = digits.length === 9 ? `51${digits}` : digits;
  const mensaje = `Hola ${pedido.cliente?.nombre || ""}, recibimos tu pedido ${pedido.numeroPedido} en ${tienda.nombre}. ` +
    `Te escribimos para coordinar el pago${metodoPagoLabel ? ` por ${metodoPagoLabel.toLowerCase()}` : ""}.`;

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Genera el HTML del email de "nuevo pedido" para el dueño de la tienda
 */
function generateNewOrderEmailHTML(pedido, tienda) {
  const pedidoUrl = `${FRONTEND_URL}/pedidos/${pedido.id}`;
  const simbolo = { PEN: "S/", USD: "$" }[tienda.moneda] || tienda.moneda || "S/";
  const money = (v) => `${simbolo} ${Number(v || 0).toFixed(2)}`;
  const metodoPagoLabel = formatMetodoPago(pedido.metodoPago);
  const whatsappUrl = buildWhatsAppClienteUrl(pedido, tienda, metodoPagoLabel);

  const fecha = pedido.fechaRegistro
    ? new Date(pedido.fechaRegistro).toLocaleDateString("es-PE", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      })
    : "";

  const cliente = pedido.cliente || {};

  const filasDetalles = (pedido.detalles || []).map(item => `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1a1a1a;">
                ${escapeHtml(item.productoNombre)}
                ${item.varianteNombre ? `<br><span style="font-size: 12px; color: #94a3b8;">${escapeHtml(item.varianteNombre)}</span>` : ""}
              </td>
              <td align="center" style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #4a4a4a;">${item.cantidad}</td>
              <td align="right" style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #4a4a4a;">${money(item.precioUnitario)}</td>
              <td align="right" style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1a1a1a;">${money(item.total)}</td>
            </tr>`).join("");

  const filaTotal = (label, value, opts = {}) => `
            <tr>
              <td colspan="3" align="right" style="padding: 6px 8px; font-size: ${opts.bold ? "16px" : "14px"}; color: ${opts.bold ? "#1a1a1a" : "#64748b"}; ${opts.bold ? "font-weight: 700;" : ""}">${label}</td>
              <td align="right" style="padding: 6px 8px; font-size: ${opts.bold ? "16px" : "14px"}; color: ${opts.color || (opts.bold ? "#1a1a1a" : "#4a4a4a")}; ${opts.bold ? "font-weight: 700;" : ""}">${value}</td>
            </tr>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo pedido ${pedido.numeroPedido}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #eee;">
              ${tienda.logoUrl ? `<img src="${tienda.logoUrl}" alt="${escapeHtml(tienda.nombre)}" style="max-height: 60px; margin-bottom: 20px;">` : ""}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">
                🛒 ¡Tienes un nuevo pedido!
              </h1>
              <p style="margin: 12px 0 0; font-size: 20px; font-weight: 700; color: #2563eb;">${pedido.numeroPedido}</p>
              ${fecha ? `<p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8;">${fecha}</p>` : ""}
            </td>
          </tr>

          <!-- Cliente -->
          <tr>
            <td style="padding: 25px 40px 0;">
              <div style="background-color: #f8fafc; padding: 16px 20px; border-radius: 8px;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Cliente</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">${escapeHtml(cliente.nombre)}</p>
                ${cliente.whatsappNumero ? `<p style="margin: 4px 0 0; font-size: 14px; color: #4a4a4a;">📱 WhatsApp: ${escapeHtml(cliente.whatsappNumero)}</p>` : ""}
                ${cliente.email ? `<p style="margin: 4px 0 0; font-size: 14px; color: #4a4a4a;">✉️ ${escapeHtml(cliente.email)}</p>` : ""}
              </div>
            </td>
          </tr>

          <!-- Detalle del pedido -->
          <tr>
            <td style="padding: 25px 40px 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <th align="left" style="padding: 8px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Producto</th>
                  <th align="center" style="padding: 8px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Cant.</th>
                  <th align="right" style="padding: 8px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Precio</th>
                  <th align="right" style="padding: 8px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Total</th>
                </tr>
                ${filasDetalles}
                ${filaTotal("Subtotal", money(pedido.subtotal))}
                ${Number(pedido.descuentoMonto) > 0 ? filaTotal(`Descuento${pedido.codigoCupon ? ` (cupón ${escapeHtml(pedido.codigoCupon)})` : ""}`, `- ${money(pedido.descuentoMonto)}`, { color: "#16a34a" }) : ""}
                ${filaTotal("Envío", Number(pedido.costoEnvio) > 0 ? money(pedido.costoEnvio) : "Gratis")}
                ${filaTotal("Total", money(pedido.total), { bold: true })}
              </table>
            </td>
          </tr>

          <!-- Pago y envío -->
          <tr>
            <td style="padding: 25px 40px 0;">
              <div style="background-color: #fef3c7; padding: 16px 20px; border-radius: 8px;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Pago y envío</p>
                ${metodoPagoLabel ? `<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Método de pago:</strong> ${escapeHtml(metodoPagoLabel)} — <strong>pago pendiente de confirmar</strong></p>` : ""}
                ${pedido.metodoEnvio ? `<p style="margin: 4px 0 0; font-size: 14px; color: #92400e;"><strong>Envío:</strong> ${escapeHtml(pedido.metodoEnvio)}</p>` : ""}
                ${pedido.direccionEnvio ? `<p style="margin: 4px 0 0; font-size: 14px; color: #92400e;"><strong>Dirección:</strong> ${escapeHtml(pedido.direccionEnvio)}</p>` : ""}
                ${pedido.notas ? `<p style="margin: 4px 0 0; font-size: 14px; color: #92400e;"><strong>Notas del cliente:</strong> ${escapeHtml(pedido.notas)}</p>` : ""}
              </div>
            </td>
          </tr>

          <!-- CTA Buttons -->
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <a href="${pedidoUrl}"
                 style="display: inline-block; margin: 4px; padding: 14px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
                Ver pedido en el panel
              </a>
              ${whatsappUrl ? `
              <a href="${whatsappUrl}"
                 style="display: inline-block; margin: 4px; padding: 14px 28px; background-color: #25d366; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px; box-shadow: 0 2px 4px rgba(37, 211, 102, 0.3);">
                Contactar al cliente por WhatsApp
              </a>` : ""}
            </td>
          </tr>

          <!-- Brand Footer -->
          <tr>
            <td style="padding: 20px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Recibiste este correo porque tu tienda <strong>${escapeHtml(tienda.nombre)}</strong> recibió un nuevo pedido.<br>
                © ${new Date().getFullYear()} Todos los derechos reservados
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Notifica al dueño de la tienda que entró un pedido nuevo.
 * No lanza si la tienda no tiene email configurado — se omite con log.
 */
export async function sendNewOrderEmail(pedido, tienda) {
  if (!tienda?.email) {
    logger.info(`📧 Pedido ${pedido.numeroPedido}: la tienda no tiene email configurado, se omite la notificación`);
    return { success: false, reason: "tienda sin email configurado" };
  }

  if (!hasResendApiKey()) {
    logger.warn("⚠️  RESEND_API_KEY no configurada. Configura tu API key en .env");
    logger.info(`📧 [DEV] Notificación de pedido ${pedido.numeroPedido} para: ${tienda.email}`);
    return { success: false, reason: "RESEND_API_KEY not configured" };
  }

  return deliverEmail({
    to: tienda.email,
    subject: `🛒 Nuevo pedido ${pedido.numeroPedido} — ${tienda.nombre}`,
    html: generateNewOrderEmailHTML(pedido, tienda)
  });
}

/**
 * Genera datos del email sin enviarlo (útil para preview)
 */
export function previewInvitationEmail(invitacion, tienda, invitadorEmail) {
  const rol = invitacion.rolCodigo || invitacion.rol;
  const emailData = {
    tiendaNombre: tienda.nombre,
    tiendaLogo: tienda.logoUrl,
    invitadorEmail,
    rol,
    mensaje: invitacion.mensaje,
    token: invitacion.token,
    fechaExpiracion: invitacion.fechaExpiracion
  };

  return {
    to: invitacion.email,
    subject: `${invitadorEmail} te invitó a unirte a ${tienda.nombre}`,
    html: generateInvitationEmailHTML(emailData)
  };
}

export default { sendInvitationEmail, previewInvitationEmail, sendNewOrderEmail };
