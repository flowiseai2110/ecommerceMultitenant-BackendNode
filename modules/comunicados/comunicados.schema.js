import { z } from "zod";
import { NIVELES } from "./comunicados.logic.js";

/** Query de las rutas admin: requireTiendaAccess valida la membresía con este id. */
export const comunicadosQuerySchema = z
  .object({
    tiendaId: z.string({ required_error: "El ID de tienda es requerido" }).uuid("ID de tienda inválido")
  })
  .passthrough();

/**
 * Ruta interna ("/paginas/politicas", nunca "//otro.com" ni "/\otro.com") o
 * https. Se rechaza javascript:, data:, http: y cualquier otro esquema (R1.4).
 */
export function linkSeguro(link) {
  if (/^\/(?![/\\])/.test(link)) return true;
  try {
    return new URL(link).protocol === "https:" && link.startsWith("https://");
  } catch {
    return false;
  }
}

const fechaIso = z
  .string({ invalid_type_error: "Fecha inválida" })
  .datetime({ offset: true, message: "Fecha inválida (formato ISO con zona horaria)" });

const botonSchema = z.object({
  texto: z.string().trim().min(1, "El texto del botón es obligatorio").max(30, "El texto del botón admite 30 caracteres"),
  link: z
    .string()
    .trim()
    .min(1, "El enlace del botón es obligatorio")
    .max(500, "El enlace es demasiado largo")
    .refine(linkSeguro, "El enlace debe ser una página de tu tienda (/…) o una dirección https://")
});

export const comunicadoSchema = z.object({
  id: z.string().uuid("ID inválido").optional(),
  titulo: z.string().trim().min(3, "El título debe tener al menos 3 caracteres").max(80, "El título admite 80 caracteres"),
  mensaje: z.string().trim().min(1, "El mensaje es obligatorio").max(800, "El mensaje admite 800 caracteres"),
  nivel: z.enum(NIVELES, { errorMap: () => ({ message: "Nivel inválido" }) }),
  formato: z.enum(["modal", "barra"], { errorMap: () => ({ message: "Formato inválido" }) }),
  inicio: fechaIso.nullable().optional(),
  fin: fechaIso,
  pausado: z.boolean().default(false),
  afectaCompras: z.boolean().default(false),
  paginas: z.enum(["todas", "inicio"]).default("todas"),
  frecuencia: z.enum(["una_vez", "cada_visita"]).default("una_vez"),
  boton: botonSchema.nullable().optional()
});

export const updateComunicadosSchema = z
  .object({
    comunicados: z.array(comunicadoSchema, { required_error: "Falta la lista de comunicados" })
  })
  .superRefine(({ comunicados }, ctx) => {
    const vistos = new Set();
    comunicados.forEach((c, i) => {
      if (!c.id) return;
      if (vistos.has(c.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comunicados", i, "id"], message: "Comunicado repetido" });
      }
      vistos.add(c.id);
    });
  });

// Fase 2 (R7): rango de fechas civiles de Lima de las reservas a avisar.
const fechaCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");

export const comunicadoIdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

export const rangoEmailSchema = z.object({ desde: fechaCivil, hasta: fechaCivil });

export const rangoEmailQuerySchema = comunicadosQuerySchema.and(rangoEmailSchema);
