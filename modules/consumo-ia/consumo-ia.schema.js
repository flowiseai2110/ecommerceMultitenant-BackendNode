import { z } from "zod";

export const consumoIaQuerySchema = z
  .object({
    tiendaId: z
      .string({ required_error: "El ID de tienda es requerido" })
      .uuid("ID de tienda inválido")
  })
  .passthrough();

export const consumoIaParamsSchema = z.object({
  tipo: z.enum(["asesor", "asistente"], { required_error: "Tipo inválido" })
});

/**
 * PUT /:tipo — ajuste del dueño. null en `limite` = usar el tope del plan;
 * null en `avisoPct` = sin aviso por correo. El tope del plan se valida en el servicio.
 */
export const ajustesConsumoIaSchema = z.object({
  limite: z.number().int("El límite debe ser un número entero").min(0, "El límite no puede ser negativo").nullable(),
  avisoPct: z.number().int().min(1, "El aviso debe estar entre 1% y 100%").max(100, "El aviso debe estar entre 1% y 100%").nullable()
});
