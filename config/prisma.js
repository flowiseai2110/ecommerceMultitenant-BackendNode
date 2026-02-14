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

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
  logger.info("Prisma disconnected");
});

export default prisma;
