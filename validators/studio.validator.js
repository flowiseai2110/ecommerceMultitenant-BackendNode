import { z } from "zod";

export const TIPOS_STUDIO = ["logo", "banner", "producto"];

// Body multipart: tipo + prompt llegan como campos de texto junto a los archivos
export const generarStudioSchema = z.object({
  tipo: z.enum(TIPOS_STUDIO, { message: `tipo debe ser uno de: ${TIPOS_STUDIO.join(", ")}` }),
  prompt: z.string({ required_error: "El prompt es requerido" })
    .min(1, "El prompt es requerido")
    .max(1000, "El prompt no puede exceder 1000 caracteres")
});

export const studioTaskIdParamSchema = z.object({
  taskId: z.string({ required_error: "El taskId es requerido" }).min(1, "taskId inválido")
});

export default { generarStudioSchema, studioTaskIdParamSchema, TIPOS_STUDIO };
