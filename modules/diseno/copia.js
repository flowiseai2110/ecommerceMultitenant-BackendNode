import { FORMATO_ACTUAL } from "./migrar.js";
import { layoutDeNegocio } from "./secciones.schema.js";

// Copia de una plantilla para guardarla como estructura de la tienda (R3).
// La tienda edita esta copia; las mejoras posteriores de la plantilla no le
// llegan (docs/specs/estructura-tienda, "copia completa").

// Secciones que afirman cosas concretas del negocio (garantías, plazos de
// entrega, "100 % originales", registro sanitario): se copian ocultas hasta
// que el dueño las revise (R3.5). La plataforma nunca publica en nombre de la
// tienda algo que el dueño no dijo (D.L. 1044, actos de engaño).
// `servicios` también: "desayuno incluido" o "cochera" son promesas del
// hospedaje (docs/specs/diseno-por-rubro H5).
// `fijo-semanal` promete un descuento del negocio (alquiler-canchas).
export const TIPOS_CON_AFIRMACIONES = new Set(["beneficios", "cinta", "faq", "imagen-texto", "servicios", "fijo-semanal"]);

const clonar = (valor) => structuredClone(valor);
const vacio = (texto) => !texto || !String(texto).trim();

/** Textos del hero que ya escribió el dueño: de su estructura o de la clave `hero`. */
function heroPropio(estructuraAnterior, hero) {
  const anterior = estructuraAnterior?.home?.secciones?.find((s) => s.tipo === "hero");
  const fuente = anterior ?? hero ?? {};
  return {
    titulo: vacio(fuente.titulo) ? null : fuente.titulo,
    subtitulo: vacio(fuente.subtitulo) ? null : fuente.subtitulo,
    textoBoton: vacio(fuente.textoBoton) ? null : fuente.textoBoton
  };
}

function copiarSeccion(seccion, hero) {
  const s = clonar(seccion);
  switch (s.tipo) {
    case "hero":
      // El título y el subtítulo de ejemplo también afirman cosas ("con
      // garantía de verdad", "delivery el mismo día") y el hero no se puede
      // ocultar: sin texto propio quedan vacíos y el storefront muestra el
      // nombre y la descripción de la tienda, como hoy (R3.4). El botón es
      // genérico y se conserva si el dueño no puso uno.
      return { ...s, titulo: hero.titulo, subtitulo: hero.subtitulo, textoBoton: hero.textoBoton ?? s.textoBoton ?? null };
    case "testimonios":
      // Nunca reseñas inventadas como si fueran reales (R3.2).
      return { ...s, items: [] };
    case "liga":
      // Ni equipos inventados: llega vacía y oculta (plantillas-canchas PC3).
      return { ...s, equipos: [], oculto: true };
    case "oferta":
      // Sin fecha no hay cuenta regresiva: el dueño la pone para mostrarla (R3.3).
      return { ...s, oculto: true, terminaEn: null };
    default:
      return TIPOS_CON_AFIRMACIONES.has(s.tipo) ? { ...s, oculto: true, ejemplo: true } : s;
  }
}

/**
 * Estructura nueva a partir de una plantilla del catálogo. Pura: no muta la
 * plantilla (está congelada) ni sus argumentos.
 *
 * @param {object} plantilla Plantilla de plantillas.js.
 * @param {{ estructuraAnterior?: object | null, hero?: object | null }} previo
 *   Lo que la tienda ya tenía, para no perder los textos del hero.
 */
export function copiarPlantilla(plantilla, { estructuraAnterior = null, hero = null } = {}) {
  const textosHero = heroPropio(estructuraAnterior, hero);
  return {
    formato: FORMATO_ACTUAL,
    plantillaId: plantilla.id,
    plantillaVersion: plantilla.version,
    radio: plantilla.radio,
    encabezados: plantilla.encabezados,
    layout: layoutDeNegocio(clonar(plantilla.layout), plantilla.tipoNegocio),
    home: { secciones: plantilla.secciones.map((s) => copiarSeccion(s, textosHero)) }
  };
}

// ── Plantilla a partir del diseño de una tienda (editor-diseno-en-vivo P5) ──

/**
 * Lo que guarda una plantilla creada desde el editor: la estructura de la
 * tienda sin sus fotos propias (son de su bucket; otra tienda no podría
 * publicarlas) y sin la marca de ejemplo. Los textos quedan como ejemplo:
 * al copiarla a una tienda rigen las reglas de copia (R3).
 */
export function contenidoDePlantilla(estructura, tema = null) {
  const secciones = estructura.home.secciones.map((seccion) => {
    const { ejemplo: _ejemplo, ...s } = clonar(seccion);
    if (s.tipo === "imagen-texto" && s.imagen === "propia") return { ...s, imagen: "banner", imagenUrl: null };
    // Sin fotos no puede mostrarse (mínimo 3): queda oculta, como su preset.
    if (s.tipo === "galeria") return { ...s, fotos: [], oculto: true };
    return s;
  });
  return {
    radio: estructura.radio,
    encabezados: estructura.encabezados,
    layout: clonar(estructura.layout),
    secciones,
    tema: tema ? { paleta: tema.paleta, tipografia: tema.tipografia } : null
  };
}

/** Id legible y único: "canchas-simple-4f2a". */
export function idDePlantilla(nombre, existe, azar = () => Math.random().toString(16).slice(2, 6)) {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "plantilla";
  let id;
  do {
    id = `${base}-${azar()}`;
  } while (existe(id));
  return id;
}
