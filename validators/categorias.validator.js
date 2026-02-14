import { z } from "zod";

// Schema base para categorías
const categoriasBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  categoriaPadreId: z.string().uuid("ID de categoría padre inválido").optional().nullable(),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1, "El nombre es requerido").max(100, "El nombre no puede exceder 100 caracteres"),
  slug: z.string({ required_error: "El slug es requerido" }).min(1, "El slug es requerido").max(100, "El slug no puede exceder 100 caracteres"),
  descripcion: z.string().max(1000, "La descripción no puede exceder 1000 caracteres").optional().nullable(),
  imagenUrl: z.string().url("URL de imagen inválida").max(500, "La URL no puede exceder 500 caracteres").optional().nullable(),
  orden: z.number().int("El orden debe ser un número entero").min(0).optional().default(0),
  activo: z.boolean().optional().default(true)
};

// Schema para crear categoría
export const createCategoriaSchema = z.object({
  tiendaId: categoriasBaseSchema.tiendaId,
  categoriaPadreId: categoriasBaseSchema.categoriaPadreId,
  nombre: categoriasBaseSchema.nombre,
  slug: categoriasBaseSchema.slug,
  descripcion: categoriasBaseSchema.descripcion,
  imagenUrl: categoriasBaseSchema.imagenUrl,
  orden: categoriasBaseSchema.orden,
  activo: categoriasBaseSchema.activo
});

// Schema para actualizar categoría
export const updateCategoriaSchema = z.object({
  tiendaId: categoriasBaseSchema.tiendaId.optional(),
  categoriaPadreId: categoriasBaseSchema.categoriaPadreId,
  nombre: categoriasBaseSchema.nombre.optional(),
  slug: categoriasBaseSchema.slug.optional(),
  descripcion: categoriasBaseSchema.descripcion,
  imagenUrl: categoriasBaseSchema.imagenUrl,
  orden: categoriasBaseSchema.orden,
  activo: categoriasBaseSchema.activo
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
  createCategoriaSchema,
  updateCategoriaSchema,
  idParamSchema,
  paginationSchema
};
