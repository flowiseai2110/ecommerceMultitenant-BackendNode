import { prisma } from "../config/prisma.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { getCodigoRol } from "../services/roles.service.js";

const ROL_JERARQUIA = ["viewer", "editor", "admin", "owner"];

// Cache en memoria: evita un round-trip a Supabase por request
// TTL 5 min — suficiente para reflejar cambios de rol sin lag perceptible
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _getCache(userId, tiendaId) {
  const entry = _cache.get(`${userId}:${tiendaId}`);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(`${userId}:${tiendaId}`); return null; }
  return entry.data;
}

function _setCache(userId, tiendaId, data) {
  _cache.set(`${userId}:${tiendaId}`, { ts: Date.now(), data });
}

/**
 * Middleware factory que verifica que el usuario autenticado
 * tiene acceso a la tienda con el rol mínimo requerido.
 *
 * Extrae tiendaId de (en orden de prioridad):
 *   req.body.tiendaId → req.params.tiendaId → req.query.tiendaId
 *
 * Agrega req.tiendaId y req.tiendaMembership al request para uso posterior.
 *
 * @param {string} minRol - Rol mínimo: "viewer" | "editor" | "admin" | "owner"
 */
export function requireTiendaAccess(minRol = "viewer") {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError("Usuario no autenticado"));
      }

      const tiendaId =
        req.body?.tiendaId ||
        req.params?.tiendaId ||
        req.query?.tiendaId;

      if (!tiendaId) {
        return next(new ForbiddenError("Se requiere tiendaId para verificar acceso"));
      }

      let cached = _getCache(req.user.id, tiendaId);

      if (!cached) {
        const membership = await prisma.usuario_tiendas.findFirst({
          where: { userId: req.user.id, tiendaId, activo: true }
        });

        if (!membership) {
          return next(new ForbiddenError("No tienes acceso a esta tienda"));
        }

        const codigoRol = await getCodigoRol(membership.rol);
        cached = { membership, codigoRol };
        _setCache(req.user.id, tiendaId, cached);
      }

      const { membership, codigoRol } = cached;
      const nivelUsuario = ROL_JERARQUIA.indexOf(codigoRol);
      const nivelMinimo = ROL_JERARQUIA.indexOf(minRol);

      if (nivelUsuario < nivelMinimo) {
        return next(
          new ForbiddenError(
            `Se requiere rol "${minRol}" o superior. Tu rol actual es "${codigoRol}"`
          )
        );
      }

      req.tiendaId = tiendaId;
      req.tiendaMembership = membership;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory que resuelve req.params.tiendaId a partir del propio
 * recurso cuando el cliente no lo envía en body/params/query (rutas tipo
 * PUT/DELETE /:id). Debe ejecutarse ANTES de requireTiendaAccess.
 *
 * Sin esto, requireTiendaAccess no tendría tiendaId con qué validar
 * membresía, y la verificación de pertenencia del recurso se omitiría
 * (permitiendo modificar/eliminar registros de otras tiendas).
 *
 * @param {(req: import("express").Request) => Promise<string|null>} resolver
 *   Función que devuelve el tiendaId dueño del recurso, o null si no existe.
 */
export function resolveTiendaId(resolver) {
  return async (req, res, next) => {
    try {
      if (!req.body?.tiendaId && !req.params?.tiendaId && !req.query?.tiendaId) {
        const tiendaId = await resolver(req);
        if (tiendaId) req.params.tiendaId = tiendaId;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default { requireTiendaAccess, resolveTiendaId };
