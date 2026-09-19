import { z } from "zod";

export const codigoParamSchema = z.object({
  codigo: z.string().min(1).max(50)
});

export const validarCuponQuerySchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  subtotal: z.coerce.number({ required_error: "El subtotal es requerido" }).min(0),
  whatsappNumero: z.string().min(9).max(20).optional()
});

export const createCuponSchema = z.object({
  tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido"),
  codigo: z.string({ required_error: "El código es requerido" }).min(1).max(50).transform(v => v.toUpperCase()),
  tipo: z.enum(["porcentaje", "monto_fijo"], { required_error: "El tipo es requerido" }),
  valor: z.coerce.number({ required_error: "El valor es requerido" }).min(0.01),
  minimoCompra: z.coerce.number().min(0).optional().default(0),
  usoMaximo: z.coerce.number().int().min(1).nullable().optional(),
  usoMaximoPorCliente: z.coerce.number().int().min(1).nullable().optional().default(1),
  fechaInicio: z.coerce.date().nullable().optional(),
  fechaFin: z.coerce.date().nullable().optional(),
  activo: z.boolean().optional().default(true)
});

export const updateCuponSchema = z.object({
  codigo: z.string().min(1).max(50).transform(v => v.toUpperCase()).optional(),
  tipo: z.enum(["porcentaje", "monto_fijo"]).optional(),
  valor: z.coerce.number().min(0.01).optional(),
  minimoCompra: z.coerce.number().min(0).optional(),
  usoMaximo: z.coerce.number().int().min(1).nullable().optional(),
  usoMaximoPorCliente: z.coerce.number().int().min(1).nullable().optional(),
  fechaInicio: z.coerce.date().nullable().optional(),
  fechaFin: z.coerce.date().nullable().optional(),
  activo: z.boolean().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe proporcionar al menos un campo para actualizar" }
);

export const idParamSchema = z.object({
  id: z.string().uuid("ID inválido")
});

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(v => parseInt(v, 10)).optional(),
  limit: z.string().regex(/^\d+$/).transform(v => parseInt(v, 10)).optional(),
  orderBy: z.string().regex(/^[a-zA-Z_]+:(asc|desc)$/i).optional()
}).passthrough();

export default {
  codigoParamSchema,
  validarCuponQuerySchema,
  createCuponSchema,
  updateCuponSchema,
  idParamSchema,
  paginationSchema
};
