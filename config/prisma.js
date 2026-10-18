import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "./logger.js";
import { getTenantStore } from "../kernel/tenant/tenant-store.js";
import { MODELOS_DE_TIENDA } from "../kernel/tenant/alcance.js";

// Reexport del namespace `Prisma` (Prisma.sql / Prisma.join / Prisma.raw, tipos
// de error, etc.). Los services deben importarlo desde aquí y NO desde el path
// del cliente generado (`generated/prisma/...`), para no acoplarse a la ruta ni
// a la extensión .ts del código generado.
export { Prisma };

// ── Auto-scope multi-tenant (defensa en profundidad) ─────────────────────────
// Los modelos con filtro automático salen del registro ALCANCE
// (kernel/tenant/alcance.js, docs/specs/antipatrones A1): todo modelo con
// tiendaId es `tienda` salvo los `global` declarados, y el test de contrato
// falla si uno nuevo no está clasificado. Los que no tienen tienda_id (tiendas,
// enumerados, ubigeos, hijos como producto_variantes) se scopan por relación en
// la capa de servicio.

// Lecturas y operaciones masivas: el where admite cualquier filtro.
const OPERACIONES_MASIVAS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy",
  "updateMany", "updateManyAndReturn", "deleteMany"
]);

// Por clave única: desde Prisma 5 su where acepta filtros no únicos junto a la
// clave, siempre que la clave quede en la raíz. Un registro de otra tienda da
// null (findUnique) o P2025 (update/delete → 404 en errorHandler).
// create/createMany quedan fuera: el tiendaId lo pone la ruta y lo valida
// requireTiendaAccess.
const OPERACIONES_POR_CLAVE = new Set([
  "findUnique", "findUniqueOrThrow", "update", "upsert", "delete"
]);

/** El args de `operation` con el tiendaId agregado, o el mismo args si no aplica. */
export function conScopeDeTienda(model, operation, args, store) {
  const tiendaId = store && !store.bypass ? store.tiendaId : null;
  if (!tiendaId || !MODELOS_DE_TIENDA.has(String(model).toLowerCase())) return args;

  const where = args?.where;
  if (OPERACIONES_MASIVAS.has(operation)) {
    return { ...args, where: where ? { AND: [where, { tiendaId }] } : { tiendaId } };
  }
  if (OPERACIONES_POR_CLAVE.has(operation)) {
    const and = where?.AND === undefined ? [] : [].concat(where.AND);
    return { ...args, where: { ...where, AND: [...and, { tiendaId }] } };
  }
  return args;
}

/**
 * Extensión que agrega el tiendaId del contexto al where. Solo estrecha el
 * resultado (nunca lo amplía), así que no puede causar fugas cross-tenant; en el
 * peor caso (contexto mal poblado) devolvería de menos, no de más.
 * Escape explícito: runUnscoped (kernel/tenant/tenant-store.js).
 */
function tenantScopeExtension(client) {
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(conScopeDeTienda(model, operation, args, getTenantStore()));
        }
      }
    }
  });
}

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

// Cliente base (sin extender). Los listeners $on solo pueden registrarse aquí:
// el cliente que devuelve $extends NO expone $on. Se cachea en global para
// evitar múltiples instancias con hot reload (y no re-registrar listeners).
const basePrisma = globalForPrisma.prismaBase ?? new PrismaClient({
  adapter,
  log: [
    { level: "query", emit: "event" },
    { level: "error", emit: "event" },
    { level: "warn", emit: "event" }
  ]
});

if (!globalForPrisma.prismaBase) {
  if (process.env.NODE_ENV === "development") {
    basePrisma.$on("query", (e) => {
      logger.debug(`Query: ${e.query}`);
      logger.debug(`Params: ${e.params}`);
      logger.debug(`Duration: ${e.duration}ms`);
    });
  }

  basePrisma.$on("error", (e) => {
    logger.error(`Prisma Error: ${e.message}`);
  });

  basePrisma.$on("warn", (e) => {
    logger.warn(`Prisma Warning: ${e.message}`);
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaBase = basePrisma;
  }
}

// Cliente exportado = base + auto-scope multi-tenant (defensa en profundidad).
export const prisma = tenantScopeExtension(basePrisma);

// Graceful shutdown. Usamos "once" (no "on"): "beforeExit" se vuelve a emitir
// cada vez que el event loop vuelve a quedar vacío, y como este listener hace
// trabajo async ($disconnect), su propia resolución puede disparar otra ronda
// de "beforeExit" — con "on" eso entra en loop infinito (se vio en pruebas:
// millones de "Prisma disconnected" antes de poder cerrar el proceso).
// server.js ya maneja el cierre real vía SIGTERM/SIGINT con process.exit(0)
// explícito, que no pasa por "beforeExit"; este listener solo cubre el caso
// de un proceso que termina solo (scripts, REPL) sin señal de por medio.
process.once("beforeExit", async () => {
  await basePrisma.$disconnect();
  logger.info("Prisma disconnected");
});

export default prisma;
