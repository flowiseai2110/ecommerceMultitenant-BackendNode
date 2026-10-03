import winston from "winston";
import Transport from "winston-transport";
import * as Sentry from "@sentry/node";
import config from "./index.js";

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Formato personalizado para logs
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`;
  }

  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// Configuración de transports según entorno
const transports = [
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      errors({ stack: true }),
      logFormat
    )
  })
];

// En producción, agregar archivo de logs
if (config.nodeEnv === "production") {
  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      )
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      )
    })
  );
}

// Sentry Logs: los logs quedan enlazados a la traza y al error de la misma request.
if (config.sentry.dsn) {
  const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport);
  transports.push(new SentryWinstonTransport({ level: config.sentry.logLevel }));
}

export const logger = winston.createLogger({
  level: config.logging.level,
  transports
});

// Stream para morgan (opcional, para HTTP logging)
logger.stream = {
  write: (message) => logger.http(message.trim())
};

export default logger;
