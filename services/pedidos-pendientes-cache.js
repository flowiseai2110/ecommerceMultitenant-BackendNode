/**
 * Caché en memoria del conteo de pedidos pendientes por tienda.
 *
 * El backend es el único escritor de pedidos, así que el conteo solo puede
 * cambiar cuando este mismo proceso crea/actualiza/elimina un pedido: esos
 * puntos invalidan la entrada y el polling del admin se sirve desde RAM,
 * sin tocar Postgres.
 *
 * El TTL es una red de seguridad, no el mecanismo principal: cubre
 * mutaciones fuera del proceso (edición directa en la DB, otra instancia
 * del backend) acotando la desactualización máxima del badge.
 */
const TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // tiendaId -> { count, expiresAt }

export function getPendientesCount(tiendaId) {
  const entry = cache.get(tiendaId);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(tiendaId);
    return null;
  }
  return entry.count;
}

export function setPendientesCount(tiendaId, count) {
  cache.set(tiendaId, { count, expiresAt: Date.now() + TTL_MS });
}

export function invalidatePendientesCount(tiendaId) {
  cache.delete(tiendaId);
}
