import { z } from "zod";
import { PLANTILLA_IDS } from "./plantillas.js";
import { PALETA_IDS } from "./paletas.js";
import { TIPOGRAFIA_IDS } from "./tipografias.js";
import { FORMATO_ACTUAL, migrarEstructura } from "./migrar.js";

/**
 * Schemas Zod de la estructura de la tienda (claves "estructura" y "tema" de
 * tienda_configuraciones, categoría "diseno"). Ver docs/specs/estructura-tienda
 * (R4.3, R5) y los límites de plan.md.
 *
 * Misma forma que SeccionHome / DisenoLayout de FrontendStore
 * src/app/models/diseno.model.ts. Todas las opciones son listas cerradas:
 * cada valor se traduce a clases conocidas del storefront.
 */

export const TIPOS_SECCION = [
  "hero", "categorias", "productos", "beneficios", "testimonios",
  "imagen-texto", "faq", "oferta", "cinta", "contacto"
];
export const MAX_SECCIONES = 15;
// Máximo de secciones por tipo (como el `limit` de las secciones de Shopify).
// Los que no están aquí no tienen tope propio (solo el total).
export const MAX_POR_TIPO = Object.freeze({
  hero: 1, categorias: 1, testimonios: 1, faq: 1, oferta: 1, cinta: 1, contacto: 1,
  "imagen-texto": 3, productos: 4
});
export const ICONOS_BENEFICIO = ["envio", "pago", "cambios", "soporte", "garantia", "rapido", "calidad"];

const texto = (max) => z.string().trim().min(1, "No puede estar vacío").max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max) => z.string().trim().max(max, `Máximo ${max} caracteres`).nullable().optional();
const fondo = z.enum(["superficie", "pagina", "suave"]);

const base = {
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Id de sección inválido"),
  oculto: z.boolean().optional(),
  espacio: z.enum(["compacto", "normal", "amplio"]).optional(),
  // Texto de ejemplo de la plantilla que el dueño todavía no revisó (R3.5).
  ejemplo: z.boolean().optional()
};

const seccionSchema = z.discriminatedUnion("tipo", [
  z.object({
    ...base,
    tipo: z.literal("hero"),
    variante: z.enum(["imagen-completa", "compacto", "dividido", "minimal"]),
    titulo: textoOpcional(100),
    subtitulo: textoOpcional(300),
    textoBoton: textoOpcional(50)
  }),
  z.object({
    ...base,
    tipo: z.literal("categorias"),
    variante: z.enum(["grilla", "circulos", "mosaico", "chips"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160)
  }),
  z.object({
    ...base,
    tipo: z.literal("productos"),
    fuente: z.enum(["destacados", "recientes", "ofertas"]),
    variante: z.enum(["carrusel", "grilla"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(4).max(12).optional()
  }),
  z.object({
    ...base,
    tipo: z.literal("beneficios"),
    variante: z.enum(["tarjetas", "franja"]),
    fondo,
    items: z
      .array(z.object({ icono: z.enum(ICONOS_BENEFICIO), titulo: texto(40), texto: z.string().trim().max(80) }))
      .min(2, "Agrega al menos 2 beneficios")
      .max(4, "Máximo 4 beneficios")
  }),
  z.object({
    ...base,
    tipo: z.literal("testimonios"),
    fondo,
    titulo: texto(80),
    items: z
      .array(z.object({
        nombre: texto(40),
        ciudad: textoOpcional(40),
        texto: texto(300),
        estrellas: z.number().int().min(1).max(5)
      }))
      .max(6, "Máximo 6 testimonios")
  }),
  z.object({
    ...base,
    tipo: z.literal("imagen-texto"),
    fondo,
    imagen: z.enum(["banner", "categoria", "producto"]),
    posicionImagen: z.enum(["izquierda", "derecha"]),
    kicker: textoOpcional(40),
    titulo: texto(80),
    texto: texto(400),
    textoBoton: textoOpcional(30)
  }),
  z.object({
    ...base,
    tipo: z.literal("faq"),
    fondo,
    titulo: texto(80),
    items: z
      .array(z.object({ pregunta: texto(120), respuesta: texto(500) }))
      .min(1, "Agrega al menos una pregunta")
      .max(10, "Máximo 10 preguntas")
  }),
  z.object({
    ...base,
    tipo: z.literal("oferta"),
    titulo: texto(80),
    texto: z.string().trim().max(400),
    textoBoton: texto(30),
    // Obligatoria si la sección está visible (ver superRefine de la lista).
    terminaEn: z.string().datetime({ offset: true, message: "Fecha y hora inválidas" }).nullable()
  }),
  z.object({
    ...base,
    tipo: z.literal("cinta"),
    estilo: z.enum(["primario", "oscuro", "claro"]),
    items: z.array(texto(40)).min(1, "Agrega al menos un mensaje").max(6, "Máximo 6 mensajes")
  }),
  z.object({
    ...base,
    tipo: z.literal("contacto"),
    titulo: texto(80),
    texto: texto(400)
  })
]);

// Lista de secciones de la home (R4.3). Los errores apuntan a la sección
// culpable para que el admin los muestre en su tarjeta.
export const seccionesSchema = z
  .array(seccionSchema)
  .min(1, "La página de inicio necesita al menos una sección")
  .max(MAX_SECCIONES, `Máximo ${MAX_SECCIONES} secciones`)
  .superRefine((secciones, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const ids = new Set();
    const porTipo = {};

    secciones.forEach((s, i) => {
      if (ids.has(s.id)) issue([i, "id"], `Id de sección repetido: "${s.id}"`);
      ids.add(s.id);

      porTipo[s.tipo] = (porTipo[s.tipo] ?? 0) + 1;
      const max = MAX_POR_TIPO[s.tipo];
      if (max && porTipo[s.tipo] > max) {
        issue([i, "tipo"], max === 1 ? `Solo puede haber una sección de tipo "${s.tipo}"` : `Máximo ${max} secciones de tipo "${s.tipo}"`);
      }

      // El hero lleva el h1 de la página: siempre arriba.
      if (s.tipo === "hero" && i !== 0) issue([i, "tipo"], "La portada (hero) debe ser la primera sección");

      if (s.tipo === "oferta" && !s.oculto && !s.terminaEn) {
        issue([i, "terminaEn"], "Indica hasta cuándo dura la oferta o oculta la sección");
      }
    });
  });

const beneficioProductoSchema = z.object({ icono: z.enum(ICONOS_BENEFICIO), titulo: texto(40) });
const bloqueTextoSchema = z.object({ mostrar: z.boolean(), texto: textoOpcional(300) });

// Opciones del detalle de producto (R5). Con defaults: una estructura sin
// `producto` se ve como hoy.
export const productoSchema = z.object({
  galeria: z.enum(["lado", "arriba"]).default("lado"),
  envio: bloqueTextoSchema.default({ mostrar: true, texto: null }),
  devoluciones: bloqueTextoSchema.default({ mostrar: true, texto: null }),
  relacionados: z.boolean().default(true),
  resenas: z.boolean().default(true),
  beneficios: z.array(beneficioProductoSchema).max(3, "Máximo 3 beneficios").default([])
});

export const layoutSchema = z.object({
  header: z.object({ logo: z.enum(["izquierda", "centro"]) }),
  productCard: z.object({ cta: z.enum(["slide-up", "boton"]), imagen: z.enum(["cuadrada", "vertical"]) }),
  producto: productoSchema.default({})
});

// La estructura se migra al formato actual ANTES de validarla (R1.4): un
// admin con datos viejos en memoria no recibe un 400 por un cambio de forma.
export const estructuraSchema = z.preprocess(
  (valor) => (valor && typeof valor === "object" ? migrarEstructura(valor) ?? valor : valor),
  z.object({
    formato: z.literal(FORMATO_ACTUAL),
    plantillaId: z.enum(PLANTILLA_IDS),
    plantillaVersion: z.number().int().min(1),
    radio: z.enum(["recto", "suave", "redondeado"]),
    encabezados: z.enum(["comercial", "editorial", "impacto"]),
    layout: layoutSchema,
    home: z.object({ secciones: seccionesSchema })
  })
);

export const temaSchema = z.object({
  paleta: z.enum(PALETA_IDS, { errorMap: () => ({ message: "Paleta inexistente" }) }),
  tipografia: z.enum(TIPOGRAFIA_IDS, { errorMap: () => ({ message: "Tipografía inexistente" }) })
});

export const aplicarPlantillaSchema = z.object({
  plantillaId: z.enum(PLANTILLA_IDS, { errorMap: () => ({ message: "Plantilla inexistente" }) })
});
