import { z } from "zod";

export const TIPOS_METODO_ENVIO = ["courier", "delivery_propio", "recojo_tienda"];

const metodosEnvioBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1).max(50),
  tipo: z.enum(TIPOS_METODO_ENVIO, {
    required_error: "El tipo es requerido",
    invalid_type_error: "Tipo inválido"
  }),
  costoReferencial: z.coerce.number().min(0).optional().nullable(),
  instrucciones: z.string().optional().nullable(),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional().default(0)
};

export const createMetodoEnvioSchema = z.object({
  tiendaId: metodosEnvioBaseSchema.tiendaId,
  nombre: metodosEnvioBaseSchema.nombre,
  tipo: metodosEnvioBaseSchema.tipo,
  costoReferencial: metodosEnvioBaseSchema.costoReferencial,
  instrucciones: metodosEnvioBaseSchema.instrucciones,
  activo: metodosEnvioBaseSchema.activo,
  orden: metodosEnvioBaseSchema.orden
});

export const updateMetodoEnvioSchema = z.object({
  nombre: metodosEnvioBaseSchema.nombre.optional(),
  tipo: metodosEnvioBaseSchema.tipo.optional(),
  costoReferencial: metodosEnvioBaseSchema.costoReferencial,
  instrucciones: metodosEnvioBaseSchema.instrucciones,
  activo: metodosEnvioBaseSchema.activo,
  orden: metodosEnvioBaseSchema.orden
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
  createMetodoEnvioSchema,
  updateMetodoEnvioSchema,
  idParamSchema,
  paginationSchema
};
