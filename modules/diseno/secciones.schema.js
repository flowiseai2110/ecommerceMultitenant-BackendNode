import { z } from "zod";
import { buscarPlantilla } from "./plantillas.js";
import { PALETA_IDS } from "./paletas.js";
import { TIPOGRAFIA_IDS } from "./tipografias.js";
import { FORMATO_ACTUAL, migrarEstructura } from "./migrar.js";
import { DATOS, datosDe } from "../negocio/datos.js";

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
  "imagen-texto", "faq", "oferta", "cinta", "contacto",
  // Hospedaje (docs/specs/diseno-por-rubro, fase 1).
  "habitaciones", "servicios", "ubicacion", "politicas",
  // Tours (fase 2).
  "tours",
  // Eventos con entradas (fase 3).
  "eventos",
  // Fotos del lugar (docs/specs/hospedaje-completo B7).
  "galeria",
  // Salones del local de eventos (docs/specs/alquiler-locales L1.30).
  "salones",
  // Complejo de canchas (docs/specs/alquiler-canchas): portada con tarifas, canchas,
  // reservador por horas, cómo funciona y alquiler fijo semanal.
  "canchas-portada", "canchas", "reservador", "pasos", "fijo-semanal",
  // Tabla del campeonato del complejo (docs/specs/plantillas-canchas PC3).
  "liga"
];

// Secciones que puede usar cada tipo de negocio (docs/specs/diseno-por-rubro): las
// define cada rubro en modules/negocio/<rubro>/datos.js. Las de e-commerce no existen
// en un hotel y las de hotel no existen en una tienda de productos.
export const TIPOS_POR_NEGOCIO = Object.freeze(
  Object.fromEntries(Object.entries(DATOS).map(([tipo, d]) => [tipo, d.diseno.secciones]))
);

/** Tipos de sección permitidos para un tipo de negocio (uno desconocido usa los de productos). */
export function tiposPermitidos(tipoNegocio) {
  return datosDe(tipoNegocio).diseno.secciones;
}

export const MAX_SECCIONES = 15;
// Máximo de secciones por tipo (como el `limit` de las secciones de Shopify).
// Los que no están aquí no tienen tope propio (solo el total).
export const MAX_POR_TIPO = Object.freeze({
  hero: 1, categorias: 1, testimonios: 1, faq: 1, oferta: 1, cinta: 1, contacto: 1,
  "imagen-texto": 3, productos: 4,
  habitaciones: 1, servicios: 1, ubicacion: 1, politicas: 1, tours: 1, eventos: 1, galeria: 2, salones: 1,
  "canchas-portada": 1, canchas: 1, reservador: 1, pasos: 1, "fijo-semanal": 1, liga: 1
});
export const ICONOS_BENEFICIO = ["envio", "pago", "cambios", "soporte", "garantia", "rapido", "calidad"];
// Servicios de un hospedaje o de una agencia ("por qué viajar con nosotros").
// El storefront tiene un ícono para cada uno.
export const ICONOS_SERVICIO = [
  "wifi", "desayuno", "agua-caliente", "cochera", "recepcion", "aire", "calefaccion", "tv",
  "lavanderia", "traslado", "mascotas", "piscina", "restaurante", "terraza", "cocina", "equipaje", "accesible", "tours",
  // Tours (fase 2).
  "guia", "grupo", "seguro", "calendario", "idiomas",
  // Eventos (fase 3).
  "entrada", "musica", "bar",
  // Canchas (alquiler-canchas).
  "reflectores", "vestuarios", "pelota", "techada", "tribuna", "pagos"
];

const texto = (max) => z.string().trim().min(1, "No puede estar vacío").max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max) => z.string().trim().max(max, `Máximo ${max} caracteres`).nullable().optional();
const fondo = z.enum(["superficie", "pagina", "suave"]);
// Tabla de la liga: números de una temporada.
const partidos = z.number().int().min(0).max(200);
const goles = z.number().int().min(0).max(999);
const urlImagen = z.string().url("Imagen inválida").startsWith("https://", "Imagen inválida").max(500);

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
    textoBoton: textoOpcional(50),
    // Buscador sobre la portada (diseno-por-rubro): hotel = llegada, noches y
    // huéspedes (H8); tours = fecha y personas (T5); eventos = fecha (E5).
    // Se ignora en productos.
    buscador: z.boolean().optional()
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
    // "propia": una foto subida desde el admin (hospedaje-completo B7), en imagenUrl.
    imagen: z.enum(["banner", "categoria", "producto", "propia"]),
    imagenUrl: urlImagen.nullable().optional(),
    posicionImagen: z.enum(["izquierda", "derecha"]),
    kicker: textoOpcional(40),
    titulo: texto(80),
    texto: texto(400),
    textoBoton: textoOpcional(30)
  }),
  z.object({
    ...base,
    tipo: z.literal("faq"),
    // Sin variante: una columna (como hasta ahora).
    variante: z.enum(["lista", "dos-columnas"]).optional(),
    fondo,
    kicker: textoOpcional(40),
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
  }),
  // ── Hospedaje (docs/specs/diseno-por-rubro) ──
  // Las habitaciones salen de la vitrina; el dueño solo elige cómo se ven.
  z.object({
    ...base,
    tipo: z.literal("habitaciones"),
    variante: z.enum(["grilla", "carrusel"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(1).max(12).optional()
  }),
  z.object({
    ...base,
    tipo: z.literal("servicios"),
    variante: z.enum(["iconos", "lista", "tarjetas"]),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80),
    items: z
      .array(z.object({ icono: z.enum(ICONOS_SERVICIO), titulo: texto(40) }))
      .min(2, "Agrega al menos 2 servicios")
      .max(12, "Máximo 12 servicios")
  }),
  // Fotos del lugar (B7): terraza, desayuno, recepción. Las URLs son del
// bucket de la tienda (validarEstructuraDeTienda lo comprueba).
  z.object({
    ...base,
    tipo: z.literal("galeria"),
    variante: z.enum(["mosaico", "carrusel"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    fotos: z
      .array(z.object({ url: urlImagen, pie: textoOpcional(80) }))
      // El mínimo de 3 se exige solo si se ve (superRefine de la lista): recién agregada no tiene fotos.
      .max(12, "Máximo 12 fotos")
  }),
  // La dirección es la de la tienda; "cercanos" son frases del dueño.
  z.object({
    ...base,
    tipo: z.literal("ubicacion"),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80),
    texto: textoOpcional(300),
    cercanos: z.array(texto(60)).max(4, "Máximo 4 lugares cercanos").default([]),
    mapa: z.boolean().default(true)
  }),
  // Check-in, check-out y cancelación salen de la configuración de reservas.
  z.object({
    ...base,
    tipo: z.literal("politicas"),
    fondo,
    titulo: texto(80)
  }),
  // ── Tours (diseno-por-rubro, fase 2) ──
  // Los tours salen de la vitrina; el dueño solo elige cómo se ven.
  z.object({
    ...base,
    tipo: z.literal("tours"),
    variante: z.enum(["grilla", "carrusel"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(1).max(12).optional()
  }),
  // ── Eventos con entradas (diseno-por-rubro, fase 3) ──
  // La cartelera sale de la vitrina. "agenda" = una fila por función,
  // ordenada por fecha (como la programación de un teatro).
  z.object({
    ...base,
    tipo: z.literal("eventos"),
    variante: z.enum(["grilla", "carrusel", "agenda"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(1).max(12).optional()
  }),
  // ── Salones del local de eventos (alquiler-locales L1.30) ──
  z.object({
    ...base,
    tipo: z.literal("salones"),
    variante: z.enum(["grilla", "carrusel"]),
    fondo,
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(1).max(12).optional()
  }),
  // ── Complejo de canchas (docs/specs/alquiler-canchas) ──
  // Portada: las tarifas "desde" y los horarios libres de hoy salen de las canchas.
  // `acento` es el final del título, resaltado ("en 1 minuto").
  z.object({
    ...base,
    tipo: z.literal("canchas-portada"),
    // dibujo: la cancha dibujada (por defecto); foto: el banner de la tienda de
    // fondo (plantillas-canchas PC2).
    variante: z.enum(["dibujo", "foto"]).optional(),
    kicker: textoOpcional(60),
    titulo: textoOpcional(80),
    acento: textoOpcional(40),
    subtitulo: textoOpcional(300),
    textoBoton: textoOpcional(40),
    textoBotonSecundario: textoOpcional(40)
  }),
  // Las canchas salen de la vitrina; el dueño solo elige cómo se ven.
  z.object({
    ...base,
    tipo: z.literal("canchas"),
    variante: z.enum(["grilla", "carrusel"]),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80),
    subtitulo: textoOpcional(160),
    limite: z.number().int().min(1).max(12).optional()
  }),
  // Reservador: día, cancha, duración y hora con el precio calculado.
  z.object({
    ...base,
    tipo: z.literal("reservador"),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80)
  }),
  // Cómo funciona: los pasos salen de la configuración (adelanto y plazo reales).
  z.object({
    ...base,
    tipo: z.literal("pasos"),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80)
  }),
  // Tabla de la liga (plantillas-canchas PC3): el dueño escribe los equipos y
  // sus resultados; la tienda calcula puntos y orden. Sin equipos no se dibuja.
  z.object({
    ...base,
    tipo: z.literal("liga"),
    fondo,
    kicker: textoOpcional(40),
    titulo: texto(80),
    campeonato: textoOpcional(80),
    nota: textoOpcional(160),
    equipos: z
      .array(z.object({
        nombre: texto(40),
        pj: partidos, pg: partidos, pe: partidos, pp: partidos,
        gf: goles, gc: goles
      }).refine((e) => e.pg + e.pe + e.pp === e.pj, { message: "Ganados, empatados y perdidos deben sumar los jugados", path: ["pj"] }))
      .max(20, "Máximo 20 equipos")
  }),
  // Alquiler fijo semanal: banda con un botón que abre WhatsApp con el pedido armado.
  z.object({
    ...base,
    tipo: z.literal("fijo-semanal"),
    kicker: textoOpcional(40),
    titulo: texto(80),
    texto: texto(300),
    textoBoton: texto(40)
  })
]);

/**
 * Errores de las secciones que no corresponden al tipo de negocio de la
 * tienda (diseno-por-rubro H3), con la ruta que el admin usa para marcar la
 * tarjeta de la sección. Vacío si todas están permitidas.
 */
export function seccionesAjenas(secciones, tipoNegocio) {
  const permitidos = tiposPermitidos(tipoNegocio);
  const body = {};
  secciones.forEach((s, i) => {
    if (!permitidos.includes(s.tipo)) {
      body[`estructura.home.secciones.${i}.tipo`] = [`La sección "${s.tipo}" no está disponible para este tipo de negocio`];
    }
  });
  return body;
}

/** Carpeta de las fotos del diseño de una tienda en el bucket público (B7). */
export function prefijoFotosDiseno(baseUrl, tiendaId) {
  return `${baseUrl.replace(/\/+$/, "")}/${tiendaId}/diseno/`;
}

/**
 * Fotos de "imagen y texto" y de la galería que no son del bucket de la
 * tienda (hospedaje-completo B7). Se valida aparte del schema porque necesita
 * el tiendaId; mismo criterio que los widgets de imagen.
 */
export function fotosAjenas(secciones, prefijo) {
  const ajena = (url) => !url.startsWith(prefijo) || url.includes("..");
  const body = {};
  secciones.forEach((s, i) => {
    if (s.tipo === "imagen-texto" && s.imagen === "propia" && s.imagenUrl && ajena(s.imagenUrl)) {
      body[`estructura.home.secciones.${i}.imagenUrl`] = ["La foto debe subirse desde el editor"];
    }
    if (s.tipo === "galeria" && s.fotos.some(f => ajena(f.url))) {
      body[`estructura.home.secciones.${i}.fotos`] = ["Las fotos deben subirse desde el editor"];
    }
  });
  return body;
}

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

      if (s.tipo === "galeria" && !s.oculto && s.fotos.length < 3) {
        issue([i, "fotos"], "Sube al menos 3 fotos u oculta la sección");
      }

      if (s.tipo === "imagen-texto" && s.imagen === "propia" && !s.imagenUrl) {
        issue([i, "imagenUrl"], "Sube la foto o elige otra imagen");
      }

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

// Opciones de la ficha de habitación de un hotel (docs/specs/diseno-por-rubro,
// fase 1b). Igual que en el detalle de producto, el orden de los bloques es
// fijo: el dueño solo elige la galería y qué bloques se muestran.
export const habitacionSchema = z.object({
  galeria: z.enum(["carrusel", "mosaico"]).default("carrusel"),
  servicios: z.boolean().default(true),
  politicas: z.boolean().default(true),
  mapa: z.boolean().default(true),
  otras: z.boolean().default(true)
});

// Opciones de la ficha del tour (fase 2). El panel de solicitud, la duración,
// los días de salida y "lo que debes saber" (punto de encuentro, recojo,
// requisitos, cancelación) se muestran siempre.
export const tourSchema = z.object({
  galeria: z.enum(["carrusel", "mosaico"]).default("carrusel"),
  itinerario: z.boolean().default(true),
  incluye: z.boolean().default(true),
  otros: z.boolean().default(true)
});

// Opciones de la ficha del evento (fase 3). El panel de compra, las
// funciones, el lugar y la edad mínima se muestran siempre.
export const eventoSchema = z.object({
  galeria: z.enum(["carrusel", "mosaico"]).default("carrusel"),
  mapa: z.boolean().default(true),
  otros: z.boolean().default(true)
});

const headerSchema = z.object({ logo: z.enum(["izquierda", "centro"]) });
const productCardSchema = z.object({ cta: z.enum(["slide-up", "boton"]), imagen: z.enum(["cuadrada", "vertical"]) });

// Layout de cada tipo de negocio (docs/specs/layout-por-rubro RU8): el header es
// común y cada rubro suma lo suyo. Una tienda de productos no guarda opciones de
// la ficha de habitación ni un hotel las de la tarjeta de producto. Las claves de
// otro rubro se descartan (layoutDeNegocio) y las del rubro toman sus defaults.
export const LAYOUT_POR_NEGOCIO = Object.freeze({
  productos: z.object({ header: headerSchema, productCard: productCardSchema, producto: productoSchema.default({}) }),
  hotel: z.object({ header: headerSchema, habitacion: habitacionSchema.default({}) }),
  tours: z.object({ header: headerSchema, tour: tourSchema.default({}) }),
  eventos: z.object({ header: headerSchema, evento: eventoSchema.default({}) }),
  // El salón todavía no tiene opciones de ficha.
  locales: z.object({ header: headerSchema }),
  // La cancha todavía no tiene opciones de ficha.
  canchas: z.object({ header: headerSchema })
});

/** Esquema del layout de un tipo de negocio (uno desconocido usa el de productos). */
export const layoutSchemaDe = (tipoNegocio) => LAYOUT_POR_NEGOCIO[tipoNegocio] ?? LAYOUT_POR_NEGOCIO.productos;

/**
 * Layout con solo lo del tipo de negocio y sus defaults. Se aplica al leer
 * (storefront y admin), al guardar y al copiar una plantilla: las estructuras
 * guardadas antes de RU8 traen las opciones de todos los rubros.
 * @throws {z.ZodError} si lo del rubro no es válido
 */
export const layoutDeNegocio = (layout, tipoNegocio) => layoutSchemaDe(tipoNegocio).parse(layout ?? {});

// Al validar el body no se conoce el rubro de la tienda: aquí solo se exige el
// header; lo del rubro lo valida validarEstructuraDeTienda con layoutDeNegocio.
export const layoutSchema = z.object({ header: headerSchema }).passthrough();

// Las plantillas también viven en la base (editor-diseno-en-vivo P2): el id se
// valida contra el registro al momento, no contra una lista fija.
const plantillaIdSchema = z.string().max(60).refine((id) => buscarPlantilla(id) !== null, { message: "Plantilla inexistente" });

// La estructura se migra al formato actual ANTES de validarla (R1.4): un
// admin con datos viejos en memoria no recibe un 400 por un cambio de forma.
export const estructuraSchema = z.preprocess(
  (valor) => (valor && typeof valor === "object" ? migrarEstructura(valor) ?? valor : valor),
  z.object({
    formato: z.literal(FORMATO_ACTUAL),
    plantillaId: plantillaIdSchema,
    plantillaVersion: z.number().int().min(1),
    radio: z.enum(["recto", "suave", "redondeado"]),
    encabezados: z.enum(["comercial", "editorial", "impacto", "deportivo"]),
    layout: layoutSchema,
    home: z.object({ secciones: seccionesSchema })
  })
);

export const temaSchema = z.object({
  paleta: z.enum(PALETA_IDS, { errorMap: () => ({ message: "Paleta inexistente" }) }),
  tipografia: z.enum(TIPOGRAFIA_IDS, { errorMap: () => ({ message: "Tipografía inexistente" }) })
});

export const aplicarPlantillaSchema = z.object({
  plantillaId: plantillaIdSchema
});
