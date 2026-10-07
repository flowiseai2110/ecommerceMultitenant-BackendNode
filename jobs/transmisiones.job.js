import config from "../config/index.js";
import { logger } from "../config/logger.js";
import { cicloTransmisiones } from "../modules/transmisiones/transmisiones.envivo.js";
import { cicloGrabaciones } from "../modules/transmisiones/transmisiones.grabaciones.js";

/**
 * Job de transmisiones en vivo (docs/specs/transmision-eventos, Fase 2): cada
 * minuto corta a los 5 min del fin, habilita la entrada solo en la prueba y en
 * la ventana del evento, reconcilia la señal, limpia lo cancelado o terminado y
 * lleva las grabaciones (Fase 4).
 *
 * Sin bloqueo entre réplicas: la conexión pasa por pgbouncer (modo transacción)
 * y un advisory lock de sesión no es confiable ahí. En su lugar, cada paso es
 * idempotente (el corte descuenta una sola vez: updateMany con terminadaEn null).
 * Con TRANSMISIONES_JOBS=false no arranca (ej. en una réplica extra).
 */

const INTERVALO_MS = 60 * 1000;
let corriendo = false;

async function tick() {
  if (corriendo) return; // un ciclo lento no se encima con el siguiente
  corriendo = true;
  try {
    await cicloTransmisiones(new Date());
    // Grabaciones (Fase 4): partes, MP4, avisos, copia a R2 y vencimientos.
    await cicloGrabaciones(new Date());
  } catch (error) {
    logger.error(`Job de transmisiones: ${error.message}`, { stack: error.stack });
  } finally {
    corriendo = false;
  }
}

export function iniciarJobTransmisiones() {
  if (!config.transmisiones.jobs || config.nodeEnv === "test") return null;
  logger.info("Job de transmisiones en vivo: cada 60 s");
  const id = setInterval(tick, INTERVALO_MS);
  id.unref?.();
  return id;
}
