import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de tenant por request vía AsyncLocalStorage (ALS).
 *
 * Es el soporte de la red de defensa en profundidad (Etapa 2): un middleware
 * raíz abre un contexto vacío al inicio de cada request; los resolvers de tenant
 * (requireTiendaAccess / resolveTienda / setTenant) escriben el tiendaId cuando
 * lo resuelven; y la extensión de Prisma (config/prisma.js) lo lee para
 * auto-inyectar el scope en los modelos tenant. Así, si una query futura olvida
 * filtrar por tienda, el scope se aplica igual.
 *
 * NO reemplaza el filtrado explícito ni el read-policy de GenericService: es la
 * última línea, no la primera.
 */

const als = new AsyncLocalStorage();

/**
 * Abre un contexto de tenant para toda la vida del request (o de `fn`).
 * @param {() => any} fn - Continuación (ej. next() de Express).
 * @returns {any}
 */
export function runWithTenantContext(fn) {
  return als.run({ tiendaId: null, bypass: false }, fn);
}

/**
 * Escribe el tiendaId resuelto en el contexto actual (no-op si no hay contexto).
 * @param {string|null} tiendaId
 */
export function setContextTiendaId(tiendaId) {
  const store = als.getStore();
  if (store) store.tiendaId = tiendaId;
}

/**
 * Devuelve el store del contexto actual, o undefined si no hay.
 * @returns {{ tiendaId: string|null, bypass: boolean }|undefined}
 */
export function getTenantStore() {
  return als.getStore();
}

/**
 * Ejecuta `fn` con el auto-scope DESACTIVADO (escape hatch). Úsalo para queries
 * legítimamente cross-tenant sobre modelos scopeados (jobs administrativos,
 * migraciones, etc.). Crea un contexto hijo con bypass para no afectar queries
 * concurrentes fuera de `fn`.
 *
 * IMPORTANTE: es async y hace `await fn()` DENTRO del contexto bypass. Las
 * promesas de Prisma son lazy (se ejecutan al await, no al llamarlas), así que
 * si se devolviera la promesa sin esperar, la query correría fuera del bypass.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runUnscoped(fn) {
  const store = als.getStore();
  return als.run({ ...(store || { tiendaId: null }), bypass: true }, async () => await fn());
}
