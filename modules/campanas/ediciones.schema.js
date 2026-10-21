import { z } from "zod";
import { fechaSchema, horaSchema } from "./campanas.schema.js";

/**
 * Entrada de las rutas de ediciones "por año" (docs/specs/campanas-cuando R2, R7.8).
 * Las reglas que cruzan filas (fin posterior, 30 días, cruces) viven en
 * ediciones.service.js: aquí solo la forma.
 */

// R7.8: el enlace del anuncio. Solo https, nunca javascript: ni otro esquema.
const fuenteSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((f) => f || null)
  .refine((f) => {
    if (!f) return true;
    try {
      return new URL(f).protocol === "https:";
    } catch {
      return false;
    }
  }, "La fuente debe ser un enlace https://");

export const edicionBodySchema = z.object({
  // Sin nombre se usa el de la edición esperada del preset.
  nombre: z.string().trim().min(1).max(60).optional(),
  inicio: fechaSchema,
  horaInicio: horaSchema,
  fin: fechaSchema,
  horaFin: horaSchema,
  fuente: fuenteSchema
});

export const edicionParamsSchema = z.object({
  presetId: z.string().min(1).max(60),
  anio: z.coerce.number().int().min(2020).max(2100),
  clave: z.string().regex(/^[a-z0-9-]{1,30}$/, "Clave inválida")
});

export const presetParamsSchema = z.object({ presetId: z.string().min(1).max(60) });

export const anioQuerySchema = z.object({
  anio: z.coerce.number().int().min(2020).max(2100).optional()
});

// La edición que se va a cambiar, para contar sus promociones confirmadas (campanas-descuento T3b.10).
export const tiendasQuerySchema = z.object({
  anio: z.coerce.number().int().min(2020).max(2100).optional(),
  clave: z.string().regex(/^[a-z0-9-]{1,30}$/, "Clave inválida").optional()
});
