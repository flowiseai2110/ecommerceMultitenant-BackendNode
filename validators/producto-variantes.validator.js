import { z } from "zod";

// Schema base para producto variantes
const variantesBaseSchema = {
  productoId: z.string({ required_error: "El ID de producto es requerido" }).uuid("ID de producto inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1, "El nombre es requerido").max(100, "El nombre no puede exceder 100 caracteres"),
  sku: z.string().max(50, "El SKU no puede exceder 50 caracteres").optional().nullable(),
  precio: z.coerce.number().positive("El precio debe ser positivo").optional().nullable(),
  stock: z.coerce.number().int("El stock debe ser un número entero").min(0).optional().default(0),
  atributos: z.record(z.any()).optional().nullable(),
  activo: z.boolean().optional().default(true)
};

// Schema para crear variante
export const createVarianteSchema = z.object({
  productoId: variantesBaseSchema.productoId,
  nombre: variantesBaseSchema.nombre,
  sku: variantesBaseSchema.sku,
  precio: variantesBaseSchema.precio,
  stock: variantesBaseSchema.stock,
  atributos: variantesBaseSchema.atributos,
  activo: variantesBaseSchema.activo
});

// Schema para actualizar variante
export const updateVarianteSchema = z.object({
  nombre: variantesBaseSchema.nombre.optional(),
  sku: variantesBaseSchema.sku,
  precio: variantesBaseSchema.precio,
  stock: variantesBaseSchema.stock,
  atributos: variantesBaseSchema.atributos,
  activo: variantesBaseSchema.activo
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
  createVarianteSchema,
  updateVarianteSchema,
  idParamSchema,
  paginationSchema
};
