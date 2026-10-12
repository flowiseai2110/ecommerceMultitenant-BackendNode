import { config } from "../config/index.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

// Administrador de la plataforma: quien vende el SaaS, no el dueño de una
// tienda (docs/specs/editor-diseno-en-vivo, fase 2). Se reconoce por el email
// verificado del token, listado en PLATFORM_ADMIN_EMAILS.

/** @param {{ email?: string } | null | undefined} user */
export function esAdminPlataforma(user, emails = config.platform.adminEmails) {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email) && emails.includes(email);
}

/** Después de authMiddleware. */
export function requirePlatformAdmin(req, res, next) {
  if (!req.user) return next(new UnauthorizedError("Usuario no autenticado"));
  if (!esAdminPlataforma(req.user)) return next(new ForbiddenError("Solo el administrador de la plataforma puede hacer esto"));
  next();
}
