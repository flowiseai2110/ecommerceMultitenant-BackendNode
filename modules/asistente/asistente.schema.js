import { z } from "zod";
import { config } from "../../config/index.js";

/**
 * Query de las rutas admin del asistente: tiendaId lo consume requireTiendaAccess.
 */
export const asistenteQuerySchema = z
  .object({
    tiendaId: z
      .string({ required_error: "El ID de tienda es requerido" })
      .uuid("ID de tienda inválido")
  })
  .passthrough();

// El rol "system" lo pone el backend, nunca el cliente.
const mensajeHistorialSchema = z.object({
  rol: z.enum(["user", "assistant"], { required_error: "Rol inválido" }),
  contenido: z.string().min(1, "El contenido no puede estar vacío").max(4000, "Mensaje demasiado largo")
});

/**
 * POST /mensajes — stateless: el cliente manda el mensaje nuevo, el historial
 * previo y la ruta del panel donde está (solo contexto para el prompt).
 */
export const mensajeAsistenteSchema = z.object({
  mensaje: z.string({ required_error: "El mensaje es requerido" })
    .trim()
    .min(1, "El mensaje es requerido")
    .max(1000, "El mensaje no puede exceder 1000 caracteres"),
  historial: z.array(mensajeHistorialSchema)
    .max(config.asistente.maxHistorial, `El historial no puede exceder ${config.asistente.maxHistorial} mensajes`)
    .optional()
    .default([]),
  // Solo se interpola en el prompt: se limita a forma de ruta para que no sea
  // un canal de prompt injection.
  rutaActual: z.string()
    .max(100)
    .regex(/^\/[a-z0-9\-/]*$/i, "Ruta inválida")
    .optional()
});
