import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import fs from "fs/promises";
import path from "path";

/**
 * Servicio de Email
 * Por ahora guarda en archivos, luego se puede integrar con AWS SES
 */

// URL base del frontend para las invitaciones
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

/**
 * Genera el texto plano del email (para clientes que no soportan HTML)
 */
function generateInvitationEmailText({ tiendaNombre, invitadorEmail, rol, mensaje, token, fechaExpiracion }) {
  const acceptUrl = `${FRONTEND_URL}/register/invite/${token}`;
  const fechaExp = new Date(fechaExpiracion).toLocaleDateString("es-PE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `
═══════════════════════════════════════════════════════════════
                    INVITACIÓN A ${tiendaNombre.toUpperCase()}
═══════════════════════════════════════════════════════════════

¡Hola!

${invitadorEmail} te ha invitado a unirte a "${tiendaNombre}".

${mensaje ? `Mensaje del invitador:\n"${mensaje}"\n` : ""}
───────────────────────────────────────────────────────────────
TU ROL: ${rol.toUpperCase()}
───────────────────────────────────────────────────────────────

Para aceptar la invitación, haz clic en el siguiente enlace:

${acceptUrl}

───────────────────────────────────────────────────────────────
⚠️  IMPORTANTE: Esta invitación expira el ${fechaExp}
───────────────────────────────────────────────────────────────

Si no esperabas esta invitación, puedes ignorar este correo.
No se realizará ninguna acción en tu cuenta.

---
Enviado por el equipo de ${tiendaNombre}
© ${new Date().getFullYear()} Todos los derechos reservados
  `.trim();
}

/**
 * Envía email de invitación
 * Por ahora guarda en archivo, luego se integra con AWS SES
 */
export async function sendInvitationEmail(invitacion, tienda, invitadorEmail) {
  const emailData = {
    tiendaNombre: tienda.nombre,
    tiendaLogo: tienda.logoUrl,
    invitadorEmail: invitadorEmail,
    rol: invitacion.rolCodigo || invitacion.rol,
    mensaje: invitacion.mensaje,
    token: invitacion.token,
    fechaExpiracion: invitacion.fechaExpiracion
  };

  const htmlContent = generateInvitationEmailHTML(emailData);
  const textContent = generateInvitationEmailText(emailData);

  // TODO: Integrar con AWS SES
  // Por ahora, guardamos en archivo para desarrollo
  if (config.nodeEnv === "development") {
    const emailsDir = path.join(process.cwd(), "emails");

    try {
      await fs.mkdir(emailsDir, { recursive: true });

      const timestamp = Date.now();
      const baseFilename = `invitation_${invitacion.email.replace("@", "_at_")}_${timestamp}`;

      // Guardar HTML
      await fs.writeFile(
        path.join(emailsDir, `${baseFilename}.html`),
        htmlContent,
        "utf-8"
      );

      // Guardar texto plano
      await fs.writeFile(
        path.join(emailsDir, `${baseFilename}.txt`),
        textContent,
        "utf-8"
      );

      logger.info(`📧 Email de invitación guardado en: emails/${baseFilename}.html`);

      return {
        success: true,
        messageId: `dev-${timestamp}`,
        savedTo: `emails/${baseFilename}.html`
      };
    } catch (error) {
      logger.error("Error guardando email:", error);
      throw error;
    }
  }

  // En producción, usar AWS SES
  // return await sendWithAWSSES(invitacion.email, htmlContent, textContent, tienda.nombre);

  logger.warn("⚠️ Email no enviado: AWS SES no configurado");
  return { success: false, reason: "AWS SES not configured" };
}

/**
 * Genera datos del email sin enviarlo (útil para preview)
 */
export function previewInvitationEmail(invitacion, tienda, invitadorEmail) {
  const emailData = {
    tiendaNombre: tienda.nombre,
    tiendaLogo: tienda.logoUrl,
    invitadorEmail: invitadorEmail,
    rol: invitacion.rolCodigo || invitacion.rol,
    mensaje: invitacion.mensaje,
    token: invitacion.token,
    fechaExpiracion: invitacion.fechaExpiracion
  };

  return {
    to: invitacion.email,
    subject: `${invitadorEmail} te invitó a unirte a ${tienda.nombre}`,
    html: generateInvitationEmailHTML(emailData),
    text: generateInvitationEmailText(emailData)
  };
}

export default {
  sendInvitationEmail,
  previewInvitationEmail
};
