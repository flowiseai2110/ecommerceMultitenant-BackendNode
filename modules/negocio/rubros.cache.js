import { prisma } from "../../config/prisma.js";
import MemoryCache from "../../utils/memory-cache.js";
import { NotFoundError } from "../../utils/errors.js";

/**
 * Rubro de cada tienda (tiendas.tipo_negocio), desde la BD. Casi nunca cambia:
 * se cachea 60 s (como las demás cachés de tiendas) y se invalida al editar una
 * tienda (tiendas.cache.js). Módulo aparte del registro para que tiendas.cache
 * no arrastre las estrategias (y sus imports) al cargarse.
 */
const TTL_MS = 60_000;
const cache = new MemoryCache({ max: 1000 });

/** Tienda con su rubro (cacheado). */
export async function tiendaDe(tiendaId) {
  const enCache = cache.get(tiendaId);
  if (enCache) return enCache;
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { id: true, tipoNegocio: true } });
  if (!tienda) throw new NotFoundError("Tienda");
  cache.set(tiendaId, tienda, TTL_MS);
  return tienda;
}

export function invalidarRubrosCache() {
  cache.clear();
}
