import { z } from "zod";

// Schema para crear invitación
export const createInvitacionSchema = z.object({
  tiendaId: z.string().uuid("tiendaId debe ser un UUID válido"),
  email: z.string().email("Email inválido"),
  rol: z.enum(["owner", "admin", "editor", "viewer"]).default("viewer"),
  mensaje: z.string().max(500).optional()
});

// Schema para aceptar invitación
export const acceptInvitacionSchema = z.object({
  token: z.string().min(1, "Token es requerido"),
  nombre: z.string().min(2, "Nombre debe tener al menos 2 caracteres").optional(),
  password: z.string().min(6, "Password debe tener al menos 6 caracteres").optional()
});

// Schema para validar token (params)
export const tokenParamSchema = z.object({
  token: z.string().min(1, "Token es requerido")
});

// Schema para ID en params
export const idParamSchema = z.object({
  id: z.string().uuid("ID debe ser un UUID válido")
});

// Schema para tiendaId en params
export const tiendaIdParamSchema = z.object({
  tiendaId: z.string().uuid("tiendaId debe ser un UUID válido")
});

// Schema para query de listado
export const listInvitacionesQuerySchema = z.object({
  estado: z.enum(["pendiente", "aceptada", "expirada", "cancelada"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10)
});
