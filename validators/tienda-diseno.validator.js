import { z } from "zod";

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
    hero: heroSchema.optional()
  })
  .refine((data) => data.anuncio !== undefined || data.hero !== undefined, {
    message: "Debe proporcionar al menos una sección de diseño"
  });

export default {
  updateDisenoSchema
};
