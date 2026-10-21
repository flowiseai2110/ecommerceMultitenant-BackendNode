import { z } from "zod";
import { campanaTiendaSchema } from "./campanas.schema.js";
import { porcentajeValido } from "../cupones/cupones.schema.js";
import { PORCENTAJE_MAXIMO, PORCENTAJE_MINIMO } from "./promocion.js";

/**
 * Entrada del paso 3 de una campaña (docs/specs/campanas-descuento R4, R7, R9;
 * T3b.1). Solo la forma: lo que depende de la tienda (ids propios, capacidad
 * `carrito`, confirmación vigente) lo revisa promocion.service.js.
 */

export const MAX_CATEGORIAS = 200;
export const MAX_PRODUCTOS = 2000;

const ALCANCES = ["tienda", "categorias", "productos"];

// El cupón de la campaña (R4.8) tiene los campos de un cupón de la tienda
// (cupones.schema.js); sus fechas no se eligen: vence con la campaña.
const cuponCampanaSchema = z
  .object({
    codigo: z.string().trim().min(1).max(50).transform((v) => v.toUpperCase()),
    tipo: z.enum(["porcentaje", "monto_fijo"]),
    valor: z.number().min(0.01),
    minimoCompra: z.number().min(0).default(0),
    usoMaximo: z.number().int().min(1).nullable().default(null),
    usoMaximoPorCliente: z.number().int().min(1).nullable().default(1)
  })
  .strict()
  .superRefine(porcentajeValido);

export const promocionSchema = z
  .object({
    // Entero de 1 a 90 (R4.2, Q7, CA-4.1): ni 0, ni 91, ni 12,5, ni texto.
    porcentaje: z
      .number({ invalid_type_error: "El porcentaje debe ser un número" })
      .int("El porcentaje debe ser un número entero")
      .min(PORCENTAJE_MINIMO, `El porcentaje va de ${PORCENTAJE_MINIMO} a ${PORCENTAJE_MAXIMO}`)
      .max(PORCENTAJE_MAXIMO, `El porcentaje va de ${PORCENTAJE_MINIMO} a ${PORCENTAJE_MAXIMO}`),
    alcance: z.enum(ALCANCES),
    categoriaIds: z.array(z.string().uuid()).max(MAX_CATEGORIAS, `Hasta ${MAX_CATEGORIAS} categorías`).default([]),
    productoIds: z.array(z.string().uuid()).max(MAX_PRODUCTOS, `Hasta ${MAX_PRODUCTOS} productos`).default([]),
    permitirCupones: z.boolean().default(false),
    permitirEnvioGratis: z.boolean().default(false),
    cupon: cuponCampanaSchema.nullable().default(null)
  })
  .strict()
  .superRefine((p, ctx) => {
    // Un solo alcance (R4.3): la lista que no es del alcance va vacía.
    const listas = { categorias: "categoriaIds", productos: "productoIds" };
    for (const [alcance, campo] of Object.entries(listas)) {
      const ids = p[campo];
      if (p.alcance === alcance && ids.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: alcance === "categorias" ? "Elige al menos una categoría" : "Elige al menos un producto" });
      }
      if (p.alcance !== alcance && ids.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: "No corresponde al alcance elegido" });
      }
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: "Hay ids repetidos" });
      }
    }
  });

// Lo que el dueño vio al confirmar (concurrencia optimista, decisión E2):
// `version` es la de la promoción guardada que estaba editando (0 si era nueva)
// y la ventana, la que le mostró la confirmación.
const confirmarSchema = z
  .object({
    version: z.number().int().min(0),
    ventanaInicio: z.coerce.date(),
    ventanaFin: z.coerce.date()
  })
  .strict();

/** PUT /admin/tiendas/:id/campanas/:campanaId */
export const guardarCampanaSchema = z
  .object({
    campana: campanaTiendaSchema,
    promocion: promocionSchema.nullable(),
    confirmar: confirmarSchema.optional()
  })
  .strict();

/** POST /admin/tiendas/:id/campanas/:campanaId/promocion/revision */
export const revisionSchema = z
  .object({
    promocion: promocionSchema,
    // El borrador de la campaña (fechas sin guardar); sin él, la guardada.
    campana: campanaTiendaSchema.optional(),
    completa: z.boolean().default(false)
  })
  .strict();

export const campanaParamsSchema = z.object({
  id: z.string().uuid("ID inválido"),
  campanaId: z.string().uuid("ID de campaña inválido")
});
