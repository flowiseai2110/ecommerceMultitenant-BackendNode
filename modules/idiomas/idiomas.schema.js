import { z } from "zod";
import { codigoIdiomaSchema } from "./idioma.js";

/** Datos editables de un idioma de la plataforma (docs/specs/idiomas D1). */
const campos = {
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(60, "El nombre admite 60 caracteres"),
  pais: z.string().trim().regex(/^[A-Z]{2}$/, "País inválido (ISO de 2 letras, p. ej. PE)"),
  locale: z.string().trim().regex(/^[a-z]{2,3}-[A-Z]{2}$/, "Formato inválido (p. ej. es-PE)"),
  ia: z.boolean(),
  avisoIa: z.boolean(),
  activo: z.boolean(),
  orden: z.coerce.number().int().min(0).max(999)
};

export const crearIdiomaSchema = z.object({
  codigo: codigoIdiomaSchema,
  nombre: campos.nombre,
  pais: campos.pais,
  locale: campos.locale,
  ia: campos.ia.default(false),
  avisoIa: campos.avisoIa.default(false),
  activo: campos.activo.default(true),
  orden: campos.orden.default(0)
}).strict();

// El código no se cambia: está guardado en tiendas, pedidos y traducciones.
export const actualizarIdiomaSchema = z.object(campos).partial().strict()
  .refine((d) => Object.keys(d).length > 0, "Nada que actualizar");

export const codigoParamSchema = z.object({ codigo: codigoIdiomaSchema });
