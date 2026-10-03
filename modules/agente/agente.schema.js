import { z } from "zod";
import { config } from "../../config/index.js";

/**
 * Schema de entrada del asesor de ventas IA.
 *
 * El historial NO es parte del contrato: lo guarda y lo lee el backend
 * (agente.conversaciones.js). Si un cliente viejo todavía lo envía, z.object lo
 * descarta al validar, así que nunca llega al LLM.
 *
 * @see docs/specs/agente-ventas/spec.md — R1.2, R2.
 */

// Token de sesión del storefront (localStorage, crypto.randomUUID()). Ancla la
// conversación junto con la tienda. Charset cerrado: también es clave del rate limit.
const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "sessionToken inválido");

export const conversacionQuerySchema = z.object({
  sessionToken: sessionTokenSchema
});

export const mensajeAgenteSchema = z.object({
  sessionToken: sessionTokenSchema,
  mensaje: z.string({ required_error: "El mensaje es requerido" })
    .trim()
    .min(1, "El mensaje es requerido")
    .max(config.agente.maxCaracteres, `El mensaje no puede exceder ${config.agente.maxCaracteres} caracteres`)
});
