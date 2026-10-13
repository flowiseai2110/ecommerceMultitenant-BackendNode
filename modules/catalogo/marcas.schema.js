import { z } from "zod";

/**
 * Schemas Zod de entrada para marcas (solo rubros con la capacidad `marcas`).
 * El schema ES el contrato de entrada: ver docs/ARQUITECTURA.md.
 */

const marcasBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).trim().min(1, "El nombre es requerido").max(100, "El nombre no puede exceder 100 caracteres"),
  // Único por tienda (uq_marcas_tienda_slug): es lo que evita "Nike" y "nike" como dos marcas.
  slug: z.string({ required_error: "El slug es requerido" }).trim().toLowerCase().min(1, "El slug es requerido").max(100, "El slug no puede exceder 100 caracteres"),
  logoUrl: z.string().url("URL de logo inválida").max(500, "La URL no puede exceder 500 caracteres").optional().nullable(),
  orden: z.number().int("El orden debe ser un número entero").min(0).optional().default(0),
  activo: z.boolean().optional().default(true)
};

export const createMarcaSchema = z.object(marcasBaseSchema);

export const updateMarcaSchema = z.object({
  nombre: marcasBaseSchema.nombre.optional(),
  slug: marcasBaseSchema.slug.optional(),
  logoUrl: marcasBaseSchema.logoUrl,
  orden: z.number().int("El orden debe ser un número entero").min(0).optional(),
  activo: z.boolean().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe proporcionar al menos un campo para actualizar" }
);

export const idParamSchema = z.object({
  id: z.string().uuid("ID inválido")
});

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/, "La página debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  limit: z.string().regex(/^\d+$/, "El límite debe ser un número").transform((val) => parseInt(val, 10)).optional(),
  orderBy: z.string().regex(/^[a-zA-Z_]+:(asc|desc)$/i, "Formato de ordenamiento inválido").optional()
}).passthrough();
