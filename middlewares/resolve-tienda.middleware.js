import { prisma } from "../config/prisma.js";
import config from "../config/index.js";
import { NotFoundError } from "../utils/errors.js";

const CACHE_TTL_MS = 60 * 1000;

/**
 * Caché en memoria de tiendas resueltas por slug, con expiración por TTL.
 * Evita una consulta a BD en cada request del storefront — la tienda
 * de un cliente cambia de slug con muy poca frecuencia.
 *
 * En despliegues con múltiples instancias, reemplazar por Redis
 * (mismo contrato: getBySlug/invalidate) sin tocar el middleware.
 */
const cache = new Map();

async function getTiendaBySlug(slug) {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tienda;
  }

  const tienda = await prisma.tiendas.findUnique({
    where: { slug },
    select: { id: true, slug: true, nombre: true, activo: true }
  });

  cache.set(slug, { tienda, expiresAt: Date.now() + CACHE_TTL_MS });
  return tienda;
}

/**
 * Extrae el slug del subdominio si el host coincide con
 * "<slug>.<baseDomain>" y no es un subdominio reservado.
 * Devuelve null si no aplica (dominio propio, localhost, IP, etc.)
 */
function extractSlugFromSubdomain(hostname) {
  const { baseDomain, reservedSubdomains } = config.platform;
  if (!baseDomain || !hostname.endsWith(`.${baseDomain}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -(`.${baseDomain}`.length));
  // Subdominios anidados (ej. "algo.zapateriaalonso") no son válidos como slug
  if (!subdomain || subdomain.includes(".") || reservedSubdomains.includes(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Middleware "best effort" que intenta resolver la tienda del request
 * público del storefront y, si lo logra, la deja disponible en
 * req.tienda / req.tiendaId. Si no puede resolverla, simplemente
 * continúa sin poblarlas — NO bloquea la petición.
 *
 * Por qué no bloquea: el propio endpoint que el frontend usa para
 * "descubrir" el tiendaId a partir de un slug (GET /store/tiendas)
 * vive bajo este mismo router, y en desarrollo local no hay subdominio
 * (el host es "localhost"). Bloquear aquí crearía una dependencia
 * circular. Las rutas que SÍ necesitan una tienda resuelta deben
 * verificar req.tiendaId ellas mismas (o usar requireTienda más abajo).
 *
 * Estrategias, en orden (la primera que resuelva una tienda gana):
 *   1. Subdominio de la plataforma → zapateriaalonso.ecompyme.com
 *   2. Fallback explícito → :tiendaSlug en params o ?tienda= en query
 *      (modo actual / desarrollo local / sin dominio configurado)
 *
 * (La estrategia de dominio propio se añadirá aquí como un paso más
 * cuando exista un campo tiendas.dominioPersonalizado — sin afectar
 * a las estrategias existentes.)
 */
export async function resolveTienda(req, res, next) {
  try {
    let slug = extractSlugFromSubdomain(req.hostname);

    if (!slug) {
      slug = req.params?.tiendaSlug || req.query?.tienda || null;
    }

    if (slug) {
      const tienda = await getTiendaBySlug(slug);
      if (tienda?.activo) {
        req.tienda = tienda;
        req.tiendaId = tienda.id;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware que EXIGE que resolveTienda haya podido resolver una tienda.
 * Úsalo en rutas que dependen completamente del contexto de tienda
 * (catálogo, checkout, etc.) — debe ejecutarse después de resolveTienda.
 */
export function requireTienda(req, res, next) {
  if (!req.tiendaId) {
    return next(new NotFoundError("Tienda", "No se pudo determinar la tienda de la petición"));
  }
  next();
}

/**
 * Fuerza el tiendaId de la query validada al resuelto por subdominio,
 * ignorando cualquier valor que el cliente intente pasar por query string.
 * Así, navegar zapateriaalonso.ecompyme.com siempre muestra el catálogo
 * de esa tienda, sin importar qué ?tiendaId= venga en la URL.
 *
 * Si no se resolvió tienda (dev local, dominio genérico), no toca nada
 * — se preserva el flujo actual basado en ?tiendaId= explícito.
 *
 * Debe ejecutarse DESPUÉS de validate({ query: ... }).
 */
export function scopeQueryToTienda(req, res, next) {
  if (req.tiendaId) {
    const target = req.validatedQuery || req.query;
    target.tiendaId = req.tiendaId;
  }
  next();
}

/**
 * Análogo a scopeQueryToTienda pero para el body — el recurso creado
 * queda asociado a la tienda del subdominio visitado (ej. un pedido
 * siempre se crea contra esa tienda, sin importar qué tiendaId envíe
 * el cliente).
 *
 * Debe ejecutarse ANTES de validate({ body: ... }).
 */
export function scopeBodyToTienda(req, res, next) {
  if (req.tiendaId) {
    req.body = { ...req.body, tiendaId: req.tiendaId };
  }
  next();
}

/**
 * Invalida la entrada de caché de una tienda — llamar tras actualizar
 * su slug o estado "activo" para que el cambio se refleje de inmediato.
 */
export function invalidateTiendaCache(slug) {
  cache.delete(slug);
}

export default {
  resolveTienda,
  requireTienda,
  scopeQueryToTienda,
  scopeBodyToTienda,
  invalidateTiendaCache
};
