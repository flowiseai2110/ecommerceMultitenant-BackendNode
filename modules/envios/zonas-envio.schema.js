import { z } from "zod";
import { PREFIJO_UBIGEO_REGEX } from "./cotizacion.js";

const zonaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la zona es requerido").max(60),
  costo: z.coerce.number().min(0, "El costo no puede ser negativo").max(9999),
  diasMin: z.coerce.number().int().min(0).max(90).nullish(),
  diasMax: z.coerce.number().int().min(0).max(90).nullish(),
  ubigeos: z.array(z.string().regex(PREFIJO_UBIGEO_REGEX, "Código UBIGEO inválido"))
    .min(1, "La zona debe cubrir al menos un lugar")
    .max(500)
    .transform(list => [...new Set(list)])
}).refine(
  z => z.diasMin == null || z.diasMax == null || z.diasMin <= z.diasMax,
  { message: "Los días mínimos no pueden superar a los máximos", path: ["diasMax"] }
);

// PUT reemplaza todas las zonas del método de una vez: el editor del admin
// trabaja la lista completa y la guarda junta.
export const replaceZonasSchema = z.object({
  zonas: z.array(zonaSchema).max(50, "Máximo 50 zonas por método")
});

export const cotizarQuerySchema = z.object({
  // Opcional: con subdominio lo fija scopeQueryToTienda
  tiendaId: z.string().uuid("ID de tienda inválido").optional(),
  ubigeo: z.string().regex(/^\d{6}$/, "UBIGEO de distrito inválido").optional(),
  subtotal: z.coerce.number().min(0).optional().default(0)
});
