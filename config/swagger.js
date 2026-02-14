import swaggerJsdoc from "swagger-jsdoc";
import config from "./index.js";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PC.NODE.ADMIN API",
      version: "2.0.0",
      description: "API REST con arquitectura limpia - Repository/Service/Controller Pattern",
      contact: {
        name: "API Support"
      }
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: "Servidor de desarrollo"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token JWT de Supabase"
        }
      },
      schemas: {
        // Schema de respuesta estándar
        ApiResponse: {
          type: "object",
          properties: {
            status: {
              type: "integer",
              example: 200
            },
            type: {
              type: "string",
              enum: ["SUCCESS", "WARNING", "ERROR"],
              example: "SUCCESS"
            },
            code: {
              type: "string",
              example: "OPERATION_SUCCESS"
            },
            data: {
              type: "object",
              nullable: true
            }
          }
        },
        // Schema de paginación
        PaginationMeta: {
          type: "object",
          properties: {
            total: {
              type: "integer",
              example: 100
            },
            page: {
              type: "integer",
              example: 1
            },
            limit: {
              type: "integer",
              example: 10
            },
            totalPages: {
              type: "integer",
              example: 10
            },
            hasNextPage: {
              type: "boolean",
              example: true
            },
            hasPrevPage: {
              type: "boolean",
              example: false
            }
          }
        },
        // Schema de Persona
        Persona: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID único (BigInt)",
              example: "1"
            },
            dni: {
              type: "string",
              minLength: 8,
              maxLength: 15,
              example: "12345678"
            },
            nombre: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Juan"
            },
            apellidoPaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Pérez"
            },
            apellidoMaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "García"
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "juan@email.com"
            },
            fechaRegistro: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2024-01-15T10:30:00Z"
            },
            usuarioRegistro: {
              type: "string",
              nullable: true,
              example: "user@email.com"
            },
            fechaActualizacion: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2024-01-16T15:45:00Z"
            },
            usuarioActualizacion: {
              type: "string",
              nullable: true,
              example: "admin@email.com"
            }
          }
        },
        // Schema para crear persona
        CreatePersona: {
          type: "object",
          required: ["dni", "nombre", "apellidoPaterno", "apellidoMaterno"],
          properties: {
            dni: {
              type: "string",
              minLength: 8,
              maxLength: 15,
              example: "12345678"
            },
            nombre: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Juan"
            },
            apellidoPaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Pérez"
            },
            apellidoMaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "García"
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "juan@email.com"
            }
          }
        },
        // Schema para actualizar persona
        UpdatePersona: {
          type: "object",
          properties: {
            dni: {
              type: "string",
              minLength: 8,
              maxLength: 15,
              example: "12345678"
            },
            nombre: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Juan Carlos"
            },
            apellidoPaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "Pérez"
            },
            apellidoMaterno: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "García"
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "juancarlos@email.com"
            }
          }
        },
        // Schema de error de validación
        ValidationError: {
          type: "object",
          properties: {
            status: {
              type: "integer",
              example: 400
            },
            type: {
              type: "string",
              example: "WARNING"
            },
            code: {
              type: "string",
              example: "VALIDATION_ERROR"
            },
            data: {
              type: "object",
              example: {
                body: {
                  dni: ["El DNI debe tener al menos 8 caracteres"]
                }
              }
            }
          }
        },
        // Schema de error no autorizado
        UnauthorizedError: {
          type: "object",
          properties: {
            status: {
              type: "integer",
              example: 401
            },
            type: {
              type: "string",
              example: "WARNING"
            },
            code: {
              type: "string",
              example: "UNAUTHORIZED"
            },
            data: {
              type: "object",
              nullable: true
            }
          }
        },
        // Schema de error no encontrado
        NotFoundError: {
          type: "object",
          properties: {
            status: {
              type: "integer",
              example: 404
            },
            type: {
              type: "string",
              example: "WARNING"
            },
            code: {
              type: "string",
              example: "NOT_FOUND"
            },
            data: {
              type: "object",
              nullable: true
            }
          }
        }
      }
    },
    tags: [
      {
        name: "Health",
        description: "Endpoints de estado del servidor"
      },
      {
        name: "Personas",
        description: "Gestión de personas"
      }
    ]
  },
  apis: ["./routes/*.js"]
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
