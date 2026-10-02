import { z } from "zod";
import { listaCampanasSchema, listaWidgetsSchema } from "../modules/campanas/campanas.schema.js";
import { estructuraSchema, temaSchema } from "../modules/diseno/secciones.schema.js";

// Barra de anuncios: franja de texto sobre el header del storefront
const anuncioSchema = z.object({
  activo: z.boolean(),
  texto: z.string().max(200),
  link: z.string().max(500).nullable().optional()
});

// Textos del hero banner de la página de inicio. Los campos vacíos/null
// hacen que el storefront use sus valores por defecto (nombre/descripción).
const heroSchema = z.object({
  titulo: z.string().max(100).nullable().optional(),
  subtitulo: z.string().max(300).nullable().optional(),
  textoBoton: z.string().max(50).nullable().optional()
});

export const updateDisenoSchema = z
  .object({
    anuncio: anuncioSchema.optional(),
    hero: heroSchema.optional(),
    // Campañas de temporada y widgets permanentes (docs/specs/campanas-widgets).
    // Cada clave reemplaza la lista completa: el admin edita la lista entera.
    campanas: listaCampanasSchema.optional(),
    widgets: listaWidgetsSchema.optional(),
    // Paleta + tipografía y estructura de la tienda (docs/specs/estructura-tienda).
    // La estructura se reemplaza entera; para aplicar una plantilla está
    // POST /:id/diseno/estructura/aplicar (arma la copia con las reglas R3).
    tema: temaSchema.optional(),
    estructura: estructuraSchema.optional()
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Debe proporcionar al menos una sección de diseño"
  });

export default {
  updateDisenoSchema
};
