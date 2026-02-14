import { jwtVerify, createRemoteJWKSet } from "jose";
import config from "../config/index.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { logger } from "../config/logger.js";

// JWKS (JSON Web Key Set) - se crea al cargar el módulo
const JWKS = createRemoteJWKSet(new URL(config.supabaseJwksUrl));

logger.info(`JWKS URL configurada: ${config.supabaseJwksUrl}`);

/**
 * Middleware de autenticación JWT
 * Verifica el token de Supabase y extrae el usuario
 */
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError("Token de autenticación no proporcionado");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Formato de token inválido. Use: Bearer <token>");
    }

    const token = authHeader.slice(7); // Remover "Bearer "

    if (!token) {
      throw new UnauthorizedError("Token vacío");
    }

    const { payload } = await jwtVerify(token, JWKS, {
      audience: config.jwtAudience
    });

    // Agregar información del usuario al request
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "user",
      metadata: payload.user_metadata || {},
      iat: payload.iat,
      exp: payload.exp
    };

    logger.debug(`Usuario autenticado: ${req.user.email}`);

    next();
  } catch (error) {
    // Log detallado del error para diagnóstico
    logger.error("Error de autenticación detallado:", {
      message: error.message,
      code: error.code,
      name: error.name
    });

    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error.code === "ERR_JWT_EXPIRED") {
      next(new UnauthorizedError("Token expirado"));
    } else if (error.code === "ERR_JWS_INVALID" || error.code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      next(new UnauthorizedError("Token inválido"));
    } else if (error.code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS" || error.code === "ERR_JWKS_NO_MATCHING_KEY") {
      next(new UnauthorizedError("No se pudo verificar la firma del token"));
    } else {
      next(new UnauthorizedError("Error de autenticación"));
    }
  }
}

/**
 * Middleware para verificar roles específicos
 * @param {...string} allowedRoles - Roles permitidos
 * @returns {Function} Express middleware
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Usuario no autenticado"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Se requiere uno de los siguientes roles: ${allowedRoles.join(", ")}`));
    }

    next();
  };
}

/**
 * Middleware opcional de autenticación
 * No falla si no hay token, pero extrae el usuario si existe
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      audience: config.jwtAudience
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "user",
      metadata: payload.user_metadata || {}
    };

    next();
  } catch {
    // Si falla la verificación, simplemente no asignar usuario
    req.user = null;
    next();
  }
}

export default {
  authMiddleware,
  requireRole,
  optionalAuth
};
