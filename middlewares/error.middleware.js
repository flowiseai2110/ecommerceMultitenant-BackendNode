import { Prisma } from "@prisma/client";
import { apiResponse } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../config/logger.js";
import config from "../config/index.js";

/**
 * Middleware para manejar rutas no encontradas (404)
 */
export function notFoundHandler(req, res) {
  return apiResponse(res, {
    status: 404,
    type: "ERROR",
    code: "ROUTE_NOT_FOUND",
    data: {
      method: req.method,
      path: req.originalUrl
    }
  });
}

/**
 * Middleware global de manejo de errores
 */
export function errorHandler(err, req, res, next) {
  // Log del error
  logger.error({
    message: err.message,
    code: err.code,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    user: req.user?.id
  });

  // Errores de la aplicación (controlados)
  if (err instanceof AppError) {
    return apiResponse(res, {
      status: err.statusCode,
      type: err.statusCode >= 500 ? "ERROR" : "WARNING",
      code: err.code,
      data: err.details
    });
  }

  // Errores de validación de Zod
  if (err.name === "ZodError") {
    return apiResponse(res, {
      status: 400,
      type: "WARNING",
      code: "VALIDATION_ERROR",
      data: err.errors
    });
  }

  // Errores de Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err, res);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return apiResponse(res, {
      status: 400,
      type: "WARNING",
      code: "PRISMA_VALIDATION_ERROR",
      data: config.nodeEnv === "development" ? err.message : null
    });
  }

  // Error de JSON mal formado
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return apiResponse(res, {
      status: 400,
      type: "WARNING",
      code: "INVALID_JSON",
      data: { message: "El body de la petición no es un JSON válido" }
    });
  }

  // Error no controlado
  return apiResponse(res, {
    status: 500,
    type: "ERROR",
    code: "INTERNAL_SERVER_ERROR",
    data: config.nodeEnv === "development" ? {
      message: err.message,
      stack: err.stack
    } : null
  });
}

/**
 * Maneja errores específicos de Prisma
 */
function handlePrismaError(err, res) {
  const prismaErrors = {
    P2000: {
      status: 400,
      code: "VALUE_TOO_LONG",
      message: "El valor proporcionado es demasiado largo"
    },
    P2001: {
      status: 404,
      code: "RECORD_NOT_FOUND",
      message: "Registro no encontrado"
    },
    P2002: {
      status: 409,
      code: "DUPLICATE_RECORD",
      message: "Ya existe un registro con ese valor único"
    },
    P2003: {
      status: 409,
      code: "FK_CONSTRAINT_FAILED",
      message: "Violación de restricción de clave foránea"
    },
    P2004: {
      status: 400,
      code: "CONSTRAINT_FAILED",
      message: "Violación de restricción de base de datos"
    },
    P2005: {
      status: 400,
      code: "INVALID_FIELD_VALUE",
      message: "Valor inválido para el campo"
    },
    P2006: {
      status: 400,
      code: "INVALID_VALUE",
      message: "El valor proporcionado no es válido"
    },
    P2011: {
      status: 400,
      code: "NULL_CONSTRAINT_VIOLATION",
      message: "Campo requerido no puede ser nulo"
    },
    P2014: {
      status: 400,
      code: "RELATION_VIOLATION",
      message: "El cambio viola una relación requerida"
    },
    P2015: {
      status: 404,
      code: "RELATED_RECORD_NOT_FOUND",
      message: "Registro relacionado no encontrado"
    },
    P2025: {
      status: 404,
      code: "RECORD_NOT_FOUND",
      message: "Registro no encontrado o no existe"
    }
  };

  const errorInfo = prismaErrors[err.code] || {
    status: 500,
    code: "DATABASE_ERROR",
    message: "Error de base de datos"
  };

  return apiResponse(res, {
    status: errorInfo.status,
    type: errorInfo.status >= 500 ? "ERROR" : "WARNING",
    code: errorInfo.code,
    data: {
      message: errorInfo.message,
      field: err.meta?.target || err.meta?.field_name || null
    }
  });
}

export default {
  notFoundHandler,
  errorHandler
};
