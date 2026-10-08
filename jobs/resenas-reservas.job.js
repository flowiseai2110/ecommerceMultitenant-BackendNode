import config from "../config/index.js";
import { logger } from "../config/logger.js";
import { cicloResenasReservas } from "../modules/reservas/resenas-reservas.js";

/**
 * Pide la reseña después de cada estadía o tour (docs/specs/hospedaje-completo
 * C6). Cada 30 minutos; cada paso es idempotente, así que no necesita bloqueo
 * entre réplicas. Con RESENAS_RESERVAS_JOB=false no arranca.
 */

const INTERVALO_MS = 30 * 60 * 1000;
let corriendo = false;

async function tick() {
  if (corriendo) return;
  corriendo = true;
  try {
    await cicloResenasReservas(new Date());
  } catch (error) {
    logger.error(`Job de reseñas de reservas: ${error.message}`, { stack: error.stack });
  } finally {
    corriendo = false;
  }
}

export function iniciarJobResenasReservas() {
  if (process.env.RESENAS_RESERVAS_JOB === "false" || config.nodeEnv === "test") return null;
  logger.info("Job de reseñas de reservas: cada 30 min");
  const id = setInterval(tick, INTERVALO_MS);
  id.unref?.();
  return id;
}
