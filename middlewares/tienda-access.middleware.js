import { prisma } from "../config/prisma.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { getCodigoRol } from "../services/roles.service.js";

const ROL_JERARQUIA = ["viewer", "editor", "admin", "owner"];

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

      const membership = await prisma.usuario_tiendas.findFirst({
        where: { userId: req.user.id, tiendaId, activo: true }
      });

      if (!membership) {
        return next(new ForbiddenError("No tienes acceso a esta tienda"));
      }

      const codigoRol = await getCodigoRol(membership.rol);
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

export default { requireTiendaAccess };
