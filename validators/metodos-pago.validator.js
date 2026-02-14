import { z } from "zod";

const metodosPagoBaseSchema = {
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  nombre: z.string({ required_error: "El nombre es requerido" }).min(1).max(50),
  tipo: z.string({ required_error: "El tipo es requerido" }).min(1).max(50),
  instrucciones: z.string().optional().nullable(),
  cuentaInfo: z.record(z.any()).optional().nullable(),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional().default(0)
};

export const createMetodoPagoSchema = z.object({
  tiendaId: metodosPagoBaseSchema.tiendaId,
  nombre: metodosPagoBaseSchema.nombre,
  tipo: metodosPagoBaseSchema.tipo,
  instrucciones: metodosPagoBaseSchema.instrucciones,
  cuentaInfo: metodosPagoBaseSchema.cuentaInfo,
  activo: metodosPagoBaseSchema.activo,
  orden: metodosPagoBaseSchema.orden
});

export const updateMetodoPagoSchema = z.object({
  nombre: metodosPagoBaseSchema.nombre.optional(),
  tipo: metodosPagoBaseSchema.tipo.optional(),
  instrucciones: metodosPagoBaseSchema.instrucciones,
  cuentaInfo: metodosPagoBaseSchema.cuentaInfo,
  activo: metodosPagoBaseSchema.activo,
  orden: metodosPagoBaseSchema.orden
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
  createMetodoPagoSchema,
  updateMetodoPagoSchema,
  idParamSchema,
  paginationSchema
};
