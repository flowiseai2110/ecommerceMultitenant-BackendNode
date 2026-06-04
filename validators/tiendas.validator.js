import { z } from "zod";

// Schema base para persona
const tiendasBaseSchema = {
  nombre: z.string({ required_error: "El nombre es requerido" }),
  slug: z.string(),
  descripcion: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  whatsappNumero: z.string({ required_error: "El numero de whatsapp es requerido" }),
  email: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  ruc: z.string({ required_error: "El Ruc es requerido" }),
  razonSocial: z.string({ required_error: "La razón social es requerido" }),
  razonComercial: z.string({ required_error: "La razón comercial es requerido" }),
  direccionFiscal: z.string({ required_error: "La direccion fiscal es requerido" }),
  ubigeo: z.string().nullable().optional(),
  moneda: z.string().nullable().optional(),
  tipoNegocio: z.string().nullable().optional(),
  activo: z.boolean(),
  envioGratisMinimo: z.coerce.number().min(0).nullable().optional(),
  metaPixelId: z.string().max(50).nullable().optional(),
  googleAnalyticsId: z.string().max(50).nullable().optional()
};

// Schema para crear persona (todos los campos requeridos excepto email)
export const createTiendaSchema = z.object({
  nombre: tiendasBaseSchema.nombre,
  slug: tiendasBaseSchema.slug,
  descripcion: tiendasBaseSchema.descripcion,
  logoUrl : tiendasBaseSchema.logoUrl,
  bannerUrl : tiendasBaseSchema.bannerUrl,
  whatsappNumero :tiendasBaseSchema.whatsappNumero,
  email : tiendasBaseSchema.email,
  direccion : tiendasBaseSchema.direccion,
  ruc : tiendasBaseSchema.ruc,
  razonSocial : tiendasBaseSchema.razonSocial,
  razonComercial : tiendasBaseSchema.razonComercial,
  direccionFiscal : tiendasBaseSchema.direccionFiscal,
  ubigeo : tiendasBaseSchema.ubigeo,
  moneda : tiendasBaseSchema.moneda,
  tipoNegocio : tiendasBaseSchema.tipoNegocio,
  activo: tiendasBaseSchema.activo,
  envioGratisMinimo: tiendasBaseSchema.envioGratisMinimo,
  metaPixelId: tiendasBaseSchema.metaPixelId,
  googleAnalyticsId: tiendasBaseSchema.googleAnalyticsId
});

// Schema para actualizar tienda (todos los campos opcionales)
export const updateTiendaSchema = z.object({
    nombre: tiendasBaseSchema.nombre,
    slug: tiendasBaseSchema.slug,
    descripcion: tiendasBaseSchema.descripcion,
    logoUrl : tiendasBaseSchema.logoUrl,
    bannerUrl : tiendasBaseSchema.bannerUrl,
    whatsappNumero :tiendasBaseSchema.whatsappNumero,
    email : tiendasBaseSchema.email,
    direccion : tiendasBaseSchema.direccion,
    ruc : tiendasBaseSchema.ruc,
    razonSocial : tiendasBaseSchema.razonSocial,
    razonComercial : tiendasBaseSchema.razonComercial,
    direccionFiscal : tiendasBaseSchema.direccionFiscal,
    ubigeo : tiendasBaseSchema.ubigeo,
    moneda : tiendasBaseSchema.moneda,
    tipoNegocio : tiendasBaseSchema.tipoNegocio,
    activo: tiendasBaseSchema.activo,
    envioGratisMinimo: tiendasBaseSchema.envioGratisMinimo,
    metaPixelId: tiendasBaseSchema.metaPixelId,
    googleAnalyticsId: tiendasBaseSchema.googleAnalyticsId
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe proporcionar al menos un campo para actualizar" }
);

// Schema para validar ID en params
export const idParamSchema = z.object({
  id: z
    .string()
});

// Schema para validar tiendaId en params anidados (/:tiendaId/...)
export const tiendaIdParamSchema = z.object({
  tiendaId: z.string().uuid("tiendaId debe ser un UUID válido")
});

// Schema para query params de paginación
// .passthrough() permite que filtros adicionales (ej: ?slug=mi-tienda) lleguen al buildWhereClause del GenericService
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
  createTiendaSchema,
  updateTiendaSchema,
  idParamSchema,
  paginationSchema
};
