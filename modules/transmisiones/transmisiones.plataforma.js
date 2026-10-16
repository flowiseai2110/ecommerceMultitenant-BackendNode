import { prisma, Prisma } from "../../config/prisma.js";
import config from "../../config/index.js";
import { logger } from "../../config/logger.js";
import { getStreamingProvider } from "../../services/streaming/index.js";
import { sendTransmisionAlertaPlataformaEmail } from "../../services/email.service.js";
import { CUOTA_AVISO_PCT, porcentajeCuota } from "./transmisiones.reglas.js";

/**
 * Avisos a la plataforma, no a una tienda (docs/specs/transmision-eventos/mejoras.md, A1).
 *
 * El almacenamiento de Cloudflare Stream es capacidad prepagada y compartida:
 * si se llena, Cloudflare rechaza los lives nuevos de TODAS las tiendas. Hasta
 * los "Solo en vivo" graban mientras dura el evento. Decisión 2026-10-15: solo
 * se avisa, no se bloquea la activación.
 */

const MS_MIN = 60 * 1000;
/** Cada cuánto se consulta el almacenamiento (una llamada a la API). */
const REVISAR_CADA_MIN = 10;
let ultimaRevision = 0;

const dia = (ahora) => new Date(ahora.getTime() - 5 * 60 * MS_MIN).toISOString().slice(0, 10); // hora de Lima

/**
 * Envía un aviso una sola vez por clave: la fila única en
 * transmision_avisos_plataforma lo hace idempotente entre réplicas y reinicios.
 * @returns {Promise<boolean>} true si esta llamada lo envió.
 */
export async function avisarPlataforma(clave, { titulo, parrafos, detalle = null }) {
  try {
    await prisma.transmision_avisos_plataforma.create({ data: { clave: clave.slice(0, 80), detalle } });
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
  await sendTransmisionAlertaPlataformaEmail({ to, titulo, parrafos })
    .catch(e => logger.error(`No se envió el aviso a la plataforma (${clave}): ${e.message}`));
  return true;
}

const ERRORES_PLATAFORMA = {
  ERR_STORAGE_QUOTA_EXHAUSTED: {
    titulo: "Se llenó el almacenamiento de video: las transmisiones no pueden empezar",
    parrafos: [
      "Cloudflare Stream rechazó una transmisión porque el almacenamiento contratado está lleno. Ninguna tienda puede empezar a transmitir hasta que se libere espacio o se compre más.",
      "Qué hacer: comprar más capacidad en el panel de Cloudflare Stream, o borrar grabaciones vencidas."
    ]
  },
  ERR_MISSING_SUBSCRIPTION: {
    titulo: "Cloudflare Stream rechazó una transmisión: la cuenta no tiene la suscripción activa",
    parrafos: [
      "Ninguna tienda puede transmitir mientras la suscripción de Stream no esté activa.",
      "Qué hacer: revisar el pago y el plan de Stream en el panel de Cloudflare."
    ]
  }
};

/**
 * Cloudflare rechazó una señal por un problema de la cuenta (almacenamiento
 * lleno, suscripción): aviso inmediato, uno por hora y por código.
 */
export async function avisarErrorDePlataforma(codigo, { entradaId = null } = {}, ahora = new Date()) {
  const textos = ERRORES_PLATAFORMA[codigo];
  if (!textos) return false;
  return avisarPlataforma(`${codigo}:${ahora.toISOString().slice(0, 13)}`, { ...textos, detalle: { codigo, entradaId } });
}

/**
 * Consulta el almacenamiento (cada 10 min) y avisa una vez al día si pasa el
 * umbral. Lo llama el job; nunca lanza.
 */
export async function revisarAlmacenamiento(ahora = new Date()) {
  if (ahora.getTime() - ultimaRevision < REVISAR_CADA_MIN * MS_MIN) return null;
  ultimaRevision = ahora.getTime();
  try {
    const uso = await getStreamingProvider().usoAlmacenamiento();
    const pct = porcentajeCuota(uso);
    if (pct !== null && pct >= CUOTA_AVISO_PCT) {
      await avisarPlataforma(`cuota-${CUOTA_AVISO_PCT}:${dia(ahora)}`, {
        titulo: `El almacenamiento de video está al ${pct} %`,
        parrafos: [
          `Cloudflare Stream tiene ${Math.round(uso.usadoMin).toLocaleString("es-PE")} de ${uso.limiteMin.toLocaleString("es-PE")} minutos guardados.`,
          "Si se llena, ninguna tienda podrá empezar a transmitir. Las grabaciones y los eventos en curso también ocupan espacio, incluso los de \"Solo en vivo\" hasta que terminan.",
          "Qué hacer: comprar más capacidad en el panel de Cloudflare Stream."
        ],
        detalle: { ...uso, pct }
      });
    }
    return { ...uso, pct };
  } catch (e) {
    logger.warn(`No se pudo revisar el almacenamiento de video: ${e.message}`);
    return null;
  }
}

/** Solo para tests: vuelve a permitir una revisión inmediata. */
export function reiniciarRevision() {
  ultimaRevision = 0;
}
