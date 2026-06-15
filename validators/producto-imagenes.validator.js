import { z } from "zod";

// Schema base para producto imágenes
const imagenesBaseSchema = {
  productoId: z.string({ required_error: "El ID de producto es requerido" }).uuid("ID de producto inválido"),
  varianteId: z.string().uuid("ID de variante inválido").optional().nullable(),
  url: z.string({ required_error: "La URL es requerida" }).url("URL inválida").max(500, "La URL no puede exceder 500 caracteres"),
  textoAlternativo: z.string().max(200, "El texto alternativo no puede exceder 200 caracteres").optional().nullable(),
  orden: z.number().int("El orden debe ser un número entero").min(0).optional().default(0),
  esPrincipal: z.boolean().optional().default(false)
};

// Schema para crear imagen
export const createImagenSchema = z.object({
  productoId: imagenesBaseSchema.productoId,
  varianteId: imagenesBaseSchema.varianteId,
  url: imagenesBaseSchema.url,
  textoAlternativo: imagenesBaseSchema.textoAlternativo,
  orden: imagenesBaseSchema.orden,
  esPrincipal: imagenesBaseSchema.esPrincipal
});

// Schema para actualizar imagen
export const updateImagenSchema = z.object({
  varianteId: imagenesBaseSchema.varianteId,
  url: imagenesBaseSchema.url.optional(),
  textoAlternativo: imagenesBaseSchema.textoAlternativo,
  orden: imagenesBaseSchema.orden,
  esPrincipal: imagenesBaseSchema.esPrincipal
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

// Schema para upload multipart cuando productoId viene en el body
export const uploadImagenSchema = z.object({
  productoId: z.string({ required_error: "El ID de producto es requerido" }).uuid("ID de producto inválido"),
  varianteId: z.string().uuid("ID de variante inválido").optional().nullable(),
  textoAlternativo: z.string().max(200, "El texto alternativo no puede exceder 200 caracteres").optional().nullable(),
  orden: z.coerce.number({ invalid_type_error: "El orden debe ser un número" }).int().min(0).optional().default(0),
  esPrincipal: z.preprocess(v => v === "true", z.boolean()).optional().default(false),
  fit: z.enum(["cover", "contain", "fill", "inside", "outside"], {
    message: "fit debe ser: cover, contain, fill, inside u outside"
  }).optional().default("cover"),
});

// Schema para upload cuando productoId viene en el path param (:id)
export const uploadImagenForProductoSchema = uploadImagenSchema.omit({ productoId: true });

export default {
  createImagenSchema,
  updateImagenSchema,
  uploadImagenSchema,
  uploadImagenForProductoSchema,
  idParamSchema,
  paginationSchema
};
