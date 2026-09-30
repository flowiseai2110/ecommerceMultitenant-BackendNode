import { z } from "zod";
import { config } from "../../config/index.js";

/**
 * Schema de entrada del asesor de ventas IA (Fase 1).
 *
 * El endpoint es stateless en esta fase: el cliente envía el mensaje nuevo y el
 * historial previo de la conversación. El schema ES el contrato de entrada
 * (ver docs/ARQUITECTURA.md): hacia adentro el input se considera confiable.
 *
 * @see modules/agente/arquitectura.md — §6 (Fase 1).
 */

// Un mensaje del historial. Solo roles de conversación; el rol "system" lo pone
// el backend, nunca el cliente.
const mensajeHistorialSchema = z.object({
  rol: z.enum(["user", "assistant"], { required_error: "Rol inválido" }),
  contenido: z.string().min(1, "El contenido no puede estar vacío").max(4000, "Mensaje demasiado largo")
});

export const mensajeAgenteSchema = z.object({
  // Token de sesión del storefront (cookie/localStorage) — ancla la conversación
  // junto con la tienda. Aísla conversaciones entre tiendas y visitantes.
  sessionToken: z.string().min(8, "sessionToken inválido").max(64, "sessionToken inválido"),
  mensaje: z.string({ required_error: "El mensaje es requerido" })
    .min(1, "El mensaje es requerido")
    .max(2000, "El mensaje no puede exceder 2000 caracteres"),
  historial: z.array(mensajeHistorialSchema)
    .max(config.agente.maxHistorial, `El historial no puede exceder ${config.agente.maxHistorial} mensajes`)
    .optional()
    .default([])
});
