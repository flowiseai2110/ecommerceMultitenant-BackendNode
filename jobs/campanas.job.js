import { logger } from "../config/logger.js";
import config from "../config/index.js";
import { revisarFechasFaltantes } from "../modules/campanas/ediciones.faltantes.js";
import { runUnscoped } from "../kernel/tenant/tenant-store.js";

/**
 * Job de campañas (docs/specs/campanas-cuando R2.6.4): cada 6 h revisa si faltan
 * las fechas por año del Cyber Wow y avisa a la plataforma. Es idempotente
 * (bitácora una vez por proceso; el correo, una vez por la clave única de
 * avisos_plataforma), así que varias réplicas no duplican nada.
 */

const INTERVALO_MS = 6 * 60 * 60 * 1000;
/** La primera revisión espera un poco para no competir con el arranque. */
const PRIMERA_REVISION_MS = 60 * 1000;

async function tick() {
  // Sin tienda: lee datos de la plataforma (sin el auto-scope de tienda).
  await runUnscoped(() => revisarFechasFaltantes(new Date()));
}

export function iniciarJobCampanas() {
  if (config.nodeEnv === "test") return null;
  logger.info("Job de campañas: revisión de fechas por año cada 6 h");
  const primera = setTimeout(tick, PRIMERA_REVISION_MS);
  primera.unref?.();
  const id = setInterval(tick, INTERVALO_MS);
  id.unref?.();
  return id;
}
