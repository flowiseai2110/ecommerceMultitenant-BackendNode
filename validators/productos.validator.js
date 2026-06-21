import { z } from "zod";

// Schema base para productos
const productosBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  categoriaId: z.string().uuid("ID de categoría inválido").optional().nullable(),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1, "El nombre es requerido").max(200, "El nombre no puede exceder 200 caracteres"),
  slug: z.string({ required_error: "El slug es requerido" }).min(1, "El slug es requerido").max(200, "El slug no puede exceder 200 caracteres"),
  descripcion: z.string().optional().nullable(),
  descripcionCorta: z.string().max(500, "La descripción corta no puede exceder 500 caracteres").optional().nullable(),
  sku: z.string().max(50, "El SKU no puede exceder 50 caracteres").optional().nullable(),
  precioBase: z.coerce.number({ required_error: "El precio base es requerido" }).positive("El precio base debe ser positivo"),
  precioOferta: z.coerce.number().positive("El precio oferta debe ser positivo").optional().nullable(),
  precioCosto: z.coerce.number().positive("El precio costo debe ser positivo").optional().nullable(),
  stock: z.coerce.number().int("El stock debe ser un número entero").min(0).optional().default(0),
  stockAlerta: z.coerce.number().int("El stock alerta debe ser un número entero").min(0).optional().default(5),
  unidad: z.string().max(20, "La unidad no puede exceder 20 caracteres").optional().default("pieza"),
  activo: z.boolean().optional().default(true),
  destacado: z.boolean().optional().default(false),
  esServicio: z.boolean().optional().default(false),
  etiquetas: z.array(z.string()).optional().default([]),
  metadata: z.record(z.any()).optional().nullable()
};

// Schema para crear producto
export const createProductoSchema = z.object({
  tiendaId: productosBaseSchema.tiendaId,
  categoriaId: productosBaseSchema.categoriaId,
  nombre: productosBaseSchema.nombre,
  slug: productosBaseSchema.slug,
  descripcion: productosBaseSchema.descripcion,
  descripcionCorta: productosBaseSchema.descripcionCorta,
  sku: productosBaseSchema.sku,
  precioBase: productosBaseSchema.precioBase,
  precioOferta: productosBaseSchema.precioOferta,
  precioCosto: productosBaseSchema.precioCosto,
  stock: productosBaseSchema.stock,
  stockAlerta: productosBaseSchema.stockAlerta,
  unidad: productosBaseSchema.unidad,
  activo: productosBaseSchema.activo,
  destacado: productosBaseSchema.destacado,
  esServicio: productosBaseSchema.esServicio,
  etiquetas: productosBaseSchema.etiquetas,
  metadata: productosBaseSchema.metadata
});

// Schema para actualizar producto
export const updateProductoSchema = z.object({
  categoriaId: productosBaseSchema.categoriaId,
  nombre: productosBaseSchema.nombre.optional(),
  slug: productosBaseSchema.slug.optional(),
  descripcion: productosBaseSchema.descripcion,
  descripcionCorta: productosBaseSchema.descripcionCorta,
  sku: productosBaseSchema.sku,
  precioBase: productosBaseSchema.precioBase.optional(),
  precioOferta: productosBaseSchema.precioOferta,
  precioCosto: productosBaseSchema.precioCosto,
  stock: productosBaseSchema.stock,
  stockAlerta: productosBaseSchema.stockAlerta,
  unidad: productosBaseSchema.unidad,
  activo: productosBaseSchema.activo,
  destacado: productosBaseSchema.destacado,
  esServicio: productosBaseSchema.esServicio,
  etiquetas: productosBaseSchema.etiquetas,
  metadata: productosBaseSchema.metadata
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

// Schema para query params del endpoint agregado /productos/home
export const homeQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  limit: z.string().regex(/^\d+$/, "El límite debe ser un número").transform((val) => parseInt(val, 10)).optional()
});

export default {
  createProductoSchema,
  updateProductoSchema,
  idParamSchema,
  paginationSchema,
  homeQuerySchema
};
