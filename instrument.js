import * as Sentry from "@sentry/node";
import config from "./config/index.js";

/**
 * Telemetría con Sentry: errores, trazas (requests + queries Prisma/pg + llamadas
 * a Anthropic) y logs de Winston (ver config/logger.js).
 *
 * Tiene que cargarse ANTES que el resto de la app para poder instrumentar
 * express, pg, prisma, etc. En ESM eso se logra con `node --import ./instrument.js`
 * (ver scripts de package.json); un import normal desde server.js llega tarde.
 *
 * Sin SENTRY_DSN no se inicializa: todas las llamadas Sentry.* quedan como no-op.
 */
if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    tracesSampleRate: config.sentry.tracesSampleRate,
    dataCollection: {
      // Los bodies pueden traer contraseñas, datos de tarjeta o tokens de Culqi.
      // El error handler adjunta el body sanitizado solo cuando hay un 500.
      httpBodies: [],
      // Parámetros bound de las queries: emails, teléfonos, direcciones de clientes.
      // El SQL parametrizado (sin valores) se sigue enviando.
      databaseQueryData: false,
      // Mensajes del chat del asesor y respuestas del modelo: es justo lo que hace
      // falta para depurar el agente.
      genAI: { inputs: true, outputs: true }
    }
  });
}
