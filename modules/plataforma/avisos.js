import { prisma, Prisma } from "../../config/prisma.js";
import config from "../../config/index.js";
import { logger } from "../../config/logger.js";
import { sendAlertaPlataformaEmail } from "../../services/email.service.js";

/**
 * Avisos a la plataforma, no a una tienda (transmisiones: almacenamiento de
 * video; campañas: fechas por año sin cargar). Una sola forma de "avisar una
 * vez": la fila única de avisos_plataforma lo hace idempotente entre réplicas
 * y reinicios.
 */

/**
 * Envía un aviso una sola vez por clave: la fila única en avisos_plataforma
 * (tabla transmision_avisos_plataforma) lo hace idempotente.
 * @returns {Promise<boolean>} true si esta llamada lo envió.
 */
export async function avisarPlataforma(clave, { titulo, parrafos, detalle = null }) {
  try {
    await prisma.avisos_plataforma.create({ data: { clave: clave.slice(0, 80), detalle } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
  logger.error(`Aviso a la plataforma: ${titulo}`);
  const to = config.transmisiones.alertasEmails;
  if (!to.length) {
    logger.warn("Sin TRANSMISIONES_ALERTAS_EMAIL ni PLATFORM_ADMIN_EMAILS: el aviso solo quedó en el log");
    return true;
  }
  await sendAlertaPlataformaEmail({ to, titulo, parrafos })
    .catch(e => logger.error(`No se envió el aviso a la plataforma (${clave}): ${e.message}`));
  return true;
}
