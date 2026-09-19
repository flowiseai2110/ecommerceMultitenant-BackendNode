import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "./logger.js";

// Reexport del namespace `Prisma` (Prisma.sql / Prisma.join / Prisma.raw, tipos
// de error, etc.). Los services deben importarlo desde aquí y NO desde el path
// del cliente generado (`generated/prisma/...`), para no acoplarse a la ruta ni
// a la extensión .ts del código generado.
export { Prisma };

// Singleton pattern para PrismaClient
const globalForPrisma = globalThis;

// Prisma 7 (rust-free): la conexión ya no se declara en schema.prisma, se pasa
// un driver adapter al constructor. Para PostgreSQL usamos @prisma/adapter-pg,
// que envuelve el pool de node-postgres (`pg`).
// El connectionString sale de DATABASE_URL (pooler de Supabase). El parámetro
// `?pgbouncer=true` es específico de Prisma; el driver pg lo ignora sin error.
//
// Config del pool de node-postgres:
// - `max`: nº máximo de conexiones que la app abre hacia el pooler de Supabase.
//   Se acota para no agotar el cupo del pooler transaccional (6543), sobre todo
//   si corren varias instancias del backend. Configurable con DB_POOL_MAX.
// - `connectionTimeoutMillis`: pg no trae timeout por defecto (el motor Rust de
//   v6 sí tenía 5s); sin esto una conexión colgada esperaría indefinidamente.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10000)
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
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
