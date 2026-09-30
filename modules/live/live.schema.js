import { z } from "zod";

/**
 * Query de las rutas admin: requiere tiendaId (lo consume requireTiendaAccess
 * para verificar membresía). El store_id efectivo sale SIEMPRE de aquí validado
 * contra la membresía, nunca del body.
 */
export const liveQuerySchema = z
  .object({
    tiendaId: z
      .string({ required_error: "El ID de tienda es requerido" })
      .uuid("ID de tienda inválido")
  })
  .passthrough();

/** Un link: string (se normaliza en el servicio) o null/"" para limpiarlo. */
const linkField = z.string().trim().max(500, "El enlace es demasiado largo").nullable();

/**
 * PUT /links — guarda o actualiza los enlaces sin activar el live.
 * Todas las claves son opcionales: solo se tocan las que llegan.
 */
export const updateLinksSchema = z
  .object({
    tiktokUrl: linkField.optional(),
    youtubeUrl: linkField.optional(),
    facebookUrl: linkField.optional()
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Envía al menos un enlace (tiktokUrl, youtubeUrl o facebookUrl)"
  });

/**
 * POST /start — inicia el live.
 * Requiere al menos una plataforma marcada (que además tenga link guardado, lo
 * cual se valida contra la BD en el servicio).
 */
export const startLiveSchema = z
  .object({
    titulo: z.string().trim().max(100, "El título no puede superar 100 caracteres").optional(),
    mostrarTiktok: z.boolean().optional().default(false),
    mostrarYoutube: z.boolean().optional().default(false),
    mostrarFacebook: z.boolean().optional().default(false),
    duracionHoras: z
      .number()
      .int("La duración debe ser un número entero de horas")
      .min(1, "La duración mínima es 1 hora")
      .max(12, "La duración máxima es 12 horas")
      .optional()
      .default(4)
  })
  .refine((d) => d.mostrarTiktok || d.mostrarYoutube || d.mostrarFacebook, {
    message: "Marca al menos una plataforma para transmitir",
    path: ["mostrarTiktok"]
  });

export default { liveQuerySchema, updateLinksSchema, startLiveSchema };
