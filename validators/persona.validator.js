import { z } from "zod";

// Schema base para persona
const personaBaseSchema = {
  dni: z
    .string({ required_error: "El DNI es requerido" })
    .min(8, "El DNI debe tener al menos 8 caracteres")
    .max(15, "El DNI no puede exceder 15 caracteres")
    .regex(/^[0-9]+$/, "El DNI solo puede contener números"),

  nombre: z
    .string({ required_error: "El nombre es requerido" })
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .trim(),

  apellidoPaterno: z
    .string({ required_error: "El apellido paterno es requerido" })
    .min(2, "El apellido paterno debe tener al menos 2 caracteres")
    .max(100, "El apellido paterno no puede exceder 100 caracteres")
    .trim(),

  apellidoMaterno: z
    .string({ required_error: "El apellido materno es requerido" })
    .min(2, "El apellido materno debe tener al menos 2 caracteres")
    .max(100, "El apellido materno no puede exceder 100 caracteres")
    .trim(),

  email: z
    .string()
    .email("El email no es válido")
    .max(255, "El email no puede exceder 255 caracteres")
    .optional()
    .nullable()
};

// Schema para crear persona (todos los campos requeridos excepto email)
export const createPersonaSchema = z.object({
  dni: personaBaseSchema.dni,
  nombre: personaBaseSchema.nombre,
  apellidoPaterno: personaBaseSchema.apellidoPaterno,
  apellidoMaterno: personaBaseSchema.apellidoMaterno,
  email: personaBaseSchema.email
});

// Schema para actualizar persona (todos los campos opcionales)
export const updatePersonaSchema = z.object({
  dni: personaBaseSchema.dni.optional(),
  nombre: personaBaseSchema.nombre.optional(),
  apellidoPaterno: personaBaseSchema.apellidoPaterno.optional(),
  apellidoMaterno: personaBaseSchema.apellidoMaterno.optional(),
  email: personaBaseSchema.email
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe proporcionar al menos un campo para actualizar" }
);

// Schema para validar ID en params
export const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "El ID debe ser un número válido")
    .transform((val) => parseInt(val, 10))
});

// Schema para query params de paginación
export const paginationSchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, "La página debe ser un número")
    .transform((val) => parseInt(val, 10))
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "El límite debe ser un número")
    .transform((val) => parseInt(val, 10))
    .optional(),
  orderBy: z
    .string()
    .regex(/^[a-zA-Z_]+:(asc|desc)$/i, "Formato de ordenamiento inválido. Use: campo:asc o campo:desc")
    .optional()
}).passthrough();

// Exportar todos los schemas
export default {
  createPersonaSchema,
  updatePersonaSchema,
  idParamSchema,
  paginationSchema
};
