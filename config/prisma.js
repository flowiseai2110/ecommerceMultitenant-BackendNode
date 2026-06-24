import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

// Singleton pattern para PrismaClient
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "error", emit: "event" },
    { level: "warn", emit: "event" }
  ]
});

// Logging de queries en desarrollo
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on("error", (e) => {
  logger.error(`Prisma Error: ${e.message}`);
});

prisma.$on("warn", (e) => {
  logger.warn(`Prisma Warning: ${e.message}`);
});

// Evitar múltiples instancias en desarrollo con hot reload
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown. Usamos "once" (no "on"): "beforeExit" se vuelve a emitir
// cada vez que el event loop vuelve a quedar vacío, y como este listener hace
// trabajo async ($disconnect), su propia resolución puede disparar otra ronda
// de "beforeExit" — con "on" eso entra en loop infinito (se vio en pruebas:
// millones de "Prisma disconnected" antes de poder cerrar el proceso).
// server.js ya maneja el cierre real vía SIGTERM/SIGINT con process.exit(0)
// explícito, que no pasa por "beforeExit"; este listener solo cubre el caso
// de un proceso que termina solo (scripts, REPL) sin señal de por medio.
process.once("beforeExit", async () => {
  await prisma.$disconnect();
  logger.info("Prisma disconnected");
});

export default prisma;
