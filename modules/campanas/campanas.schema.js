import { z } from "zod";
import { buscarPreset } from "./presets.js";
import { fechaCivilLima, parsearFecha, inicioDiaLima } from "./calendario.js";

/**
 * Schemas Zod de la configuración de campañas y widgets de una tienda
 * (claves "campanas" y "widgets" de tienda_configuraciones, categoría
 * "diseno"). Ver docs/specs/campanas-widgets (R2, R4).
 *
 * Todas las opciones son listas cerradas: cada valor se traduce a clases o
 * figuras conocidas del storefront, así ninguna combinación se ve rota.
 */

export const FIGURAS = [
  "sol", "sombrilla", "corazon", "flor", "globo", "regalo", "calabaza",
  "murcielago", "estrella", "copo", "arbol", "escarapela", "corbata", "etiqueta"
];
export const ANCLAS = [
  "hero-arriba-derecha", "hero-abajo-derecha", "hero-arriba-izquierda",
  "flotante-izquierda", "junto-logo"
];
export const MAX_WIDGETS = 5;
export const MAX_CAMPANAS = 30;
// Una campaña propia más larga que esto es, en la práctica, un rediseño.
export const MAX_DIAS_CAMPANA_PROPIA = 90;

const textoOpcional = (max) => z.string().trim().max(max).nullable().optional();

// ── Widgets (R4) ──────────────────────────────────────────────────────────

const contenidoWidgetSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("figura"), figura: z.enum(FIGURAS) }),
  // Que la URL sea del bucket de la propia tienda se valida en el servicio
  // (hace falta el tiendaId): ver urlsDeWidgetsAjenas().
  z.object({ tipo: z.literal("imagen"), url: z.string().url().startsWith("https://").max(500) }),
  z.object({
    tipo: z.literal("sello"),
    texto: z.string().trim().min(1, "El sello necesita un texto").max(12, "El sello admite hasta 12 caracteres"),
    forma: z.enum(["circulo", "estrella"])
  })
]);

export const widgetSchema = z.object({
  contenido: contenidoWidgetSchema,
  ancla: z.enum(ANCLAS),
  tamano: z.enum(["chico", "mediano", "grande"]).default("mediano"),
  animacion: z.enum(["flotar", "latir", "balanceo", "girar", "ninguna"]).default("ninguna"),
  enMovil: z.boolean().default(false)
});

// Máximo uno por ancla (R4.3): dos widgets en el mismo lugar se pisarían.
export const listaWidgetsSchema = z
  .array(widgetSchema)
  .max(MAX_WIDGETS, `Máximo ${MAX_WIDGETS} widgets`)
  .superRefine((widgets, ctx) => {
    const vistas = new Set();
    widgets.forEach((w, i) => {
      if (vistas.has(w.ancla)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "ancla"], message: `Ya hay un widget en "${w.ancla}"` });
      }
      vistas.add(w.ancla);
    });
  });

// ── Campañas (R2) ─────────────────────────────────────────────────────────

const paletaSchema = z.object({
  primario: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #rrggbb"),
  neutro: z.enum(["gray", "slate", "zinc", "neutral", "stone"]),
  fondos: z.object({
    topBar: z.enum(["oscuro", "primario", "claro"]),
    header: z.enum(["blanco", "tinte"]),
    pagina: z.enum(["neutro", "blanco", "tinte"]),
    footer: z.enum(["oscuro", "claro"])
  })
});

const fechaSchema = z.string().refine((f) => parsearFecha(f) !== null, "Fecha inválida (YYYY-MM-DD)");
const diasSchema = z.number().int().min(0).max(60).nullable().optional();

export const campanaTiendaSchema = z
  .object({
    id: z.string().uuid(),
    // null = campaña propia (aniversario, liquidación...)
    presetId: z.string().nullable(),
    activa: z.boolean(),
    nombre: textoOpcional(60),
    inicio: fechaSchema.nullable().optional(),
    fin: fechaSchema.nullable().optional(),
    anticipacionDias: diasSchema,
    despuesDias: diasSchema,
    paleta: paletaSchema.nullable().optional(),
    topBar: textoOpcional(200),
    hero: z
      .object({ titulo: textoOpcional(100), subtitulo: textoOpcional(300), textoBoton: textoOpcional(50) })
      .nullable()
      .optional(),
    cinta: z.array(z.string().trim().min(1).max(40)).min(1).max(6).nullable().optional(),
    // false = quitar la cuenta regresiva del preset; null = la del preset.
    oferta: z
      .union([
        z.object({ titulo: z.string().trim().min(1).max(80), texto: z.string().trim().max(200), textoBoton: z.string().trim().min(1).max(40) }),
        z.literal(false)
      ])
      .nullable()
      .optional(),
    // null = los del preset; [] = ninguno.
    widgets: listaWidgetsSchema.nullable().optional()
  })
  .superRefine((c, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (c.presetId !== null) {
      if (!buscarPreset(c.presetId)) issue("presetId", `No existe la campaña "${c.presetId}"`);
      // Los presets se repiten cada año: sus fechas salen de la regla.
      if (c.inicio || c.fin) issue("inicio", "Las campañas del calendario no llevan fechas fijas; ajusta la anticipación");
      return;
    }

    // Campaña propia (R2.4): nombre y fechas explícitas, sin repetición.
    if (!c.nombre) issue("nombre", "Ponle un nombre a la campaña");
    if (!c.inicio) issue("inicio", "Indica la fecha de inicio");
    if (!c.fin) issue("fin", "Indica la fecha de fin");
    if (c.anticipacionDias != null || c.despuesDias != null) {
      issue("anticipacionDias", "Una campaña propia usa fechas de inicio y fin, no anticipación");
    }
    const inicio = parsearFecha(c.inicio);
    const fin = parsearFecha(c.fin);
    if (inicio && fin) {
      const dias = (inicioDiaLima(fin) - inicioDiaLima(inicio)) / 86_400_000 + 1;
      if (dias < 1) issue("fin", "La fecha de fin no puede ser anterior al inicio");
      else if (dias > MAX_DIAS_CAMPANA_PROPIA) issue("fin", `Una campaña puede durar hasta ${MAX_DIAS_CAMPANA_PROPIA} días`);
    }
  });

export const listaCampanasSchema = z
  .array(campanaTiendaSchema)
  .max(MAX_CAMPANAS, `Máximo ${MAX_CAMPANAS} campañas`)
  .superRefine((campanas, ctx) => {
    const ids = new Set();
    const presets = new Set();
    campanas.forEach((c, i) => {
      if (ids.has(c.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "id"], message: "Id de campaña repetido" });
      ids.add(c.id);
      // Un preset se activa una sola vez: dos "Día de la Madre" competirían.
      if (c.presetId) {
        if (presets.has(c.presetId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "presetId"], message: `"${c.presetId}" ya está en la lista` });
        }
        presets.add(c.presetId);
      }
    });
  });

// ── URLs de imágenes (R4.5) ───────────────────────────────────────────────

/** Prefijo público de la carpeta de widgets de la tienda en Supabase Storage. */
export function prefijoWidgets(supabaseUrl, tiendaId) {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/tiendas/${tiendaId}/widgets/`;
}

/**
 * URLs de widgets de imagen que NO son del bucket de la tienda. Se valida
 * aparte del schema porque necesita el tiendaId. Pura, para testearla.
 */
export function urlsDeWidgetsAjenas({ campanas = [], widgets = [] }, prefijo) {
  const todas = [...(widgets ?? []), ...(campanas ?? []).flatMap((c) => c.widgets ?? [])];
  return todas
    .filter((w) => w.contenido.tipo === "imagen")
    .map((w) => w.contenido.url)
    // Sin "..": la ruta no puede salir de la carpeta del prefijo.
    .filter((url) => !url.startsWith(prefijo) || url.includes(".."));
}

// ── Query de los endpoints admin (T3.3, T3.4) ─────────────────────────────

export const calendarioQuerySchema = z.object({
  // Sin año: el actual en Lima.
  anio: z.coerce.number().int().min(2020).max(2100).optional()
}).transform((q) => ({ anio: q.anio ?? fechaCivilLima(new Date()).anio }));

export const vistaPreviaQuerySchema = z.object({
  fecha: fechaSchema
});
