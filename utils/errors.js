// Clase base para errores de la aplicación
export class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error 400 - Bad Request / Validación
export class ValidationError extends AppError {
  constructor(message = "Datos de entrada inválidos", details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

// Error 401 - No autenticado
export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
  }
}

// Error 403 - Prohibido
export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, 403, "FORBIDDEN");
  }
}

// Error 404 - No encontrado
export class NotFoundError extends AppError {
  constructor(resource = "Recurso", message = null) {
    super(message || `${resource} no encontrado`, 404, "NOT_FOUND");
  }
}

// Error 409 - Conflicto (duplicado)
export class ConflictError extends AppError {
  constructor(message = "El recurso ya existe", details = null) {
    super(message, 409, "CONFLICT", details);
  }
}

// Error 422 - Entidad no procesable
export class UnprocessableError extends AppError {
  constructor(message = "No se puede procesar la solicitud", details = null) {
    super(message, 422, "UNPROCESSABLE_ENTITY", details);
  }
}

// Error 429 - Too Many Requests
export class TooManyRequestsError extends AppError {
  constructor(message = "Demasiadas solicitudes", details = null) {
    super(message, 429, "TOO_MANY_REQUESTS", details);
  }
}

// Error 402 - Cuota de plan agotada
export class QuotaExceededError extends AppError {
  constructor(message = "Cuota del plan agotada", details = null) {
    super(message, 402, "QUOTA_EXCEEDED", details);
  }
}

// Error 500 - Error interno
export class InternalError extends AppError {
  constructor(message = "Error interno del servidor") {
    super(message, 500, "INTERNAL_ERROR");
    this.isOperational = false;
  }
}

// Error de base de datos
export class DatabaseError extends AppError {
  constructor(message = "Error de base de datos", details = null) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}

export default {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
  TooManyRequestsError,
  QuotaExceededError,
  InternalError,
  DatabaseError
};
