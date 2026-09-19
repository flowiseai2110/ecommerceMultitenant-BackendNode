/**
 * Kernel de tenant — superficie de import única para todo lo relacionado con la
 * resolución y el control de acceso multi-tenant.
 *
 * Los módulos migrados importan desde `kernel/tenant` en vez de los archivos
 * sueltos de `middlewares/`. Durante la migración esto es una fachada: reexporta
 * los guards/middlewares existentes tal cual (mismo comportamiento) y añade el
 * contexto normalizado `req.tenant`. Cuando la lógica se mueva definitivamente
 * al kernel, solo cambia la implementación detrás de estos exports, no los call
 * sites.
 *
 * @see docs/ARQUITECTURA.md — "El tenant es un invariante del dominio".
 */

// Contexto normalizado (PR 1).
export { getTenant, setTenant, requireTenantId } from "./tenant-context.js";

// Lectura de membresía usuario↔tienda para los guards.
export { findActiveMembership } from "./membership.js";

// Contexto ALS + escape hatch para el auto-scope de Prisma (defensa en profundidad).
export { runWithTenantContext, setContextTiendaId, runUnscoped } from "./tenant-store.js";

// Autenticación / rol de plataforma.
export { authMiddleware, requireRole, optionalAuth } from "../../middlewares/auth.middleware.js";

// Control de acceso por membresía en la tienda (flujo admin).
export {
  requireTiendaAccess,
  resolveTiendaId,
  scopeReadToResourceTienda
} from "../../middlewares/tienda-access.middleware.js";

// Resolución de tienda por subdominio/slug y scoping de query/body (storefront).
export {
  resolveTienda,
  requireTienda,
  scopeQueryToTienda,
  scopeBodyToTienda,
  invalidateTiendaCache
} from "../../middlewares/resolve-tienda.middleware.js";
