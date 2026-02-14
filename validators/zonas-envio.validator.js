import { z } from "zod";

const zonasEnvioBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1).max(100),
  costoEnvio: z.coerce.number({ required_error: "El costo de envío es requerido" }).min(0, "El costo no puede ser negativo"),
  envioGratisMinimo: z.coerce.number().min(0).optional().nullable(),
  diasEstimados: z.coerce.number().int().min(0).optional().nullable(),
  activo: z.boolean().optional().default(true),
  // Array de códigos de ubigeo asociados a la zona
  ubigeos: z.array(z.string().max(8)).optional().default([])
};

export const createZonaEnvioSchema = z.object({
  tiendaId: zonasEnvioBaseSchema.tiendaId,
  nombre: zonasEnvioBaseSchema.nombre,
  costoEnvio: zonasEnvioBaseSchema.costoEnvio,
  envioGratisMinimo: zonasEnvioBaseSchema.envioGratisMinimo,
  diasEstimados: zonasEnvioBaseSchema.diasEstimados,
  activo: zonasEnvioBaseSchema.activo,
  ubigeos: zonasEnvioBaseSchema.ubigeos
});

export const updateZonaEnvioSchema = z.object({
  nombre: zonasEnvioBaseSchema.nombre.optional(),
  costoEnvio: zonasEnvioBaseSchema.costoEnvio.optional(),
  envioGratisMinimo: zonasEnvioBaseSchema.envioGratisMinimo,
  diasEstimados: zonasEnvioBaseSchema.diasEstimados,
  activo: zonasEnvioBaseSchema.activo,
  ubigeos: zonasEnvioBaseSchema.ubigeos
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

export default {
  createZonaEnvioSchema,
  updateZonaEnvioSchema,
  idParamSchema,
  paginationSchema
};
