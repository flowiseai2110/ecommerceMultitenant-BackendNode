import { z } from "zod";

// Schema base para producto atributos
const atributosBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1, "El nombre es requerido").max(50, "El nombre no puede exceder 50 caracteres"),
  valores: z.array(z.string()).min(1, "Debe proporcionar al menos un valor").default([]),
  aplicaA: z.string().max(50, "El campo aplica_a no puede exceder 50 caracteres").optional().nullable()
};

// Schema para crear atributo
export const createAtributoSchema = z.object({
  tiendaId: atributosBaseSchema.tiendaId,
  nombre: atributosBaseSchema.nombre,
  valores: atributosBaseSchema.valores,
  aplicaA: atributosBaseSchema.aplicaA
});

// Schema para actualizar atributo
export const updateAtributoSchema = z.object({
  tiendaId: atributosBaseSchema.tiendaId.optional(),
  nombre: atributosBaseSchema.nombre.optional(),
  valores: atributosBaseSchema.valores.optional(),
  aplicaA: atributosBaseSchema.aplicaA
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe proporcionar al menos un campo para actualizar" }
);

// Schema para validar ID en params
export const idParamSchema = z.object({
  id: z.string().uuid("ID inválido")
});

// Schema para query params de paginación
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/, "La página debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  limit: z.string().regex(/^\d+$/, "El límite debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  orderBy: z.string().regex(/^[a-zA-Z_]+:(asc|desc)$/i, "Formato de ordenamiento inválido").optional()
}).passthrough();

export default {
  createAtributoSchema,
  updateAtributoSchema,
  idParamSchema,
  paginationSchema
};
