import config from "../config/index.js";
import { logger } from "../config/logger.js";
import { cicloTransmisiones } from "../modules/transmisiones/transmisiones.envivo.js";
import { cicloGrabaciones } from "../modules/transmisiones/transmisiones.grabaciones.js";
import { revisarAlmacenamiento } from "../modules/transmisiones/transmisiones.plataforma.js";
import { getStreamingProvider } from "../services/streaming/index.js";

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
/** Cloudflare admite 1,200 llamadas cada 5 min: se avisa en el log si un ciclo usa más del 10 %. */
const LLAMADAS_ALTAS_POR_CICLO = 120;
let corriendo = false;

async function tick() {
  if (corriendo) return; // un ciclo lento no se encima con el siguiente
  corriendo = true;
  const antes = getStreamingProvider().consumoApi().llamadas;
  try {
    await cicloTransmisiones(new Date());
    // Grabaciones (Fase 4): partes, MP4, avisos, copia a R2 y vencimientos.
    await cicloGrabaciones(new Date());
    // Almacenamiento de video casi lleno: aviso a la plataforma (cada 10 min).
    await revisarAlmacenamiento(new Date());
  } catch (error) {
    logger.error(`Job de transmisiones: ${error.message}`, { stack: error.stack });
  } finally {
    corriendo = false;
    const { llamadas, pausadaHasta } = getStreamingProvider().consumoApi();
    const usadas = llamadas - antes;
    if (pausadaHasta) logger.warn(`Proveedor de video en pausa por límite de llamadas hasta ${pausadaHasta.toISOString()} (este ciclo: ${usadas})`);
    else if (usadas >= LLAMADAS_ALTAS_POR_CICLO) logger.warn(`Job de transmisiones: ${usadas} llamadas al proveedor en un ciclo`);
  }
}

export function iniciarJobTransmisiones() {
  if (!config.transmisiones.jobs || config.nodeEnv === "test") return null;
  logger.info("Job de transmisiones en vivo: cada 60 s");
  const id = setInterval(tick, INTERVALO_MS);
  id.unref?.();
  return id;
}
