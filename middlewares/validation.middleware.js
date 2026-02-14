import { ValidationError } from "../utils/errors.js";

/**
 * Middleware factory para validación con Zod
 * @param {Object} schemas - Schemas de Zod para body, params, query
 * @returns {Function} Express middleware
 */
export function validate(schemas = {}) {
  return async (req, res, next) => {
    try {
      const errors = {};

      // Validar body
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          errors.body = formatZodErrors(result.error);
        } else {
          req.body = result.data;
        }
      }

      // Validar params
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          errors.params = formatZodErrors(result.error);
        } else {
          // En Express 5, params puede ser read-only, usar Object.assign
          Object.assign(req.params, result.data);
        }
      }

      // Validar query
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          errors.query = formatZodErrors(result.error);
        } else {
          // En Express 5, query es read-only, guardar datos validados en req.validatedQuery
          req.validatedQuery = result.data;
        }
      }

      // Si hay errores, lanzar ValidationError
      if (Object.keys(errors).length > 0) {
        throw new ValidationError("Errores de validación", errors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Formatea los errores de Zod a un formato más legible
 * @param {ZodError} zodError
 * @returns {Object}
 */
function formatZodErrors(zodError) {
  const formatted = {};

  for (const error of zodError.errors) {
    const path = error.path.join(".");
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(error.message);
  }

  return formatted;
}

/**
 * Middleware para validar solo el body
 * @param {ZodSchema} schema
 */
export function validateBody(schema) {
  return validate({ body: schema });
}

/**
 * Middleware para validar solo los params
 * @param {ZodSchema} schema
 */
export function validateParams(schema) {
  return validate({ params: schema });
}

/**
 * Middleware para validar solo la query
 * @param {ZodSchema} schema
 */
export function validateQuery(schema) {
  return validate({ query: schema });
}

export default {
  validate,
  validateBody,
  validateParams,
  validateQuery
};
