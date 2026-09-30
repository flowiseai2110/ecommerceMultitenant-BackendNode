import { z } from "zod";

export const ESTADOS_RESENA = ["pendiente", "aprobada", "rechazada"];
export const MODOS_MODERACION = ["previa", "automatica"];

const uuid = (campo) => z.string({ required_error: `${campo} es requerido` }).uuid(`${campo} inválido`);

// Texto opcional: "" o solo espacios cuentan como "sin texto" (null).
const textoOpcional = (max, mensaje) => z.string().trim().max(max, mensaje).nullish()
  .transform(v => v || null);

const paginacion = {
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10)
};

// ============================================
// STORE
// ============================================

// POST /store/resenas — con sesión (pedidoId) o con el link de WhatsApp (token).
export const crearResenaSchema = z.object({
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId"),
  pedidoId: uuid("pedidoId").optional(),
  token: z.string().min(10).max(2000).optional(),
  estrellas: z.coerce.number({ required_error: "Elige de 1 a 5 estrellas" })
    .int().min(1, "Elige de 1 a 5 estrellas").max(5, "Elige de 1 a 5 estrellas"),
  // Solo estrellas es válido: el comentario es opcional.
  comentario: textoOpcional(1000, "El comentario no puede exceder 1000 caracteres")
}).refine(d => d.pedidoId || d.token, {
  message: "Se requiere el pedido o el enlace para calificar",
  path: ["pedidoId"]
});

export const productoParamSchema = z.object({ productoId: uuid("productoId") });

export const listarProductoQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  ...paginacion
});

export const tiendaQuerySchema = z.object({ tiendaId: uuid("tiendaId") });

export const tokenParamSchema = z.object({ token: z.string().min(10).max(2000) });

// ============================================
// ADMIN
// ============================================

export const idParamSchema = z.object({ id: uuid("id") });

export const listarAdminQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  estado: z.enum(ESTADOS_RESENA).optional(),
  ...paginacion,
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const cambiarEstadoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  // Moderar es aprobar o rechazar; "pendiente" solo lo pone el sistema.
  estado: z.enum(["aprobada", "rechazada"], { message: "estado debe ser aprobada o rechazada" })
});

export const responderSchema = z.object({
  tiendaId: uuid("tiendaId"),
  // null o "" borra la respuesta.
  respuesta: textoOpcional(1000, "La respuesta no puede exceder 1000 caracteres")
});

export const configModeracionSchema = z.object({
  tiendaId: uuid("tiendaId"),
  moderacion: z.enum(MODOS_MODERACION, { message: "moderacion debe ser previa o automatica" })
});
