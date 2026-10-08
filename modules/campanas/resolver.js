// Resolución de campañas — lógica pura (sin BD ni reloj) para poder testearla.
//
// La tienda guarda personalizaciones (claves "campanas" y "widgets" de
// tienda_configuraciones); aquí se mezclan con los presets y se arma lo que
// recibe el storefront: la campaña vigente ya resuelta, con fechas en hora
// de Lima. Ver docs/specs/campanas-widgets (R3, R4.6, R6).

import { CAMPANA_PRESETS, buscarPreset, sugeridoPara } from "./presets.js";
import { aIsoLima, ventana, vigente } from "./calendario.js";
import { resolverTema } from "../diseno/resolver.js";

const ANCLAS_ORDEN = ["hero-arriba-derecha", "hero-abajo-derecha", "hero-arriba-izquierda", "flotante-izquierda", "junto-logo"];

/**
 * Campaña de la tienda + su preset → objeto que entiende calendario.js
 * (regla o fechas propias) con el contenido ya mezclado: cada campo es el
 * de la tienda o, si no lo personalizó, el del preset. Null si el preset ya
 * no existe (se retiró del catálogo después de que la tienda lo activó).
 */
export function efectiva(c) {
  const preset = c.presetId ? buscarPreset(c.presetId) : null;
  if (c.presetId && !preset) return null;

  const base = preset ?? {};
  return {
    id: c.id,
    presetId: c.presetId ?? null,
    nombre: c.nombre || base.nombre || "Campaña",
    // Calendario: los presets se repiten con su regla; las propias tienen fechas.
    ...(preset
      ? {
          regla: preset.regla,
          anticipacionDias: c.anticipacionDias ?? preset.anticipacionDias,
          despuesDias: c.despuesDias ?? preset.despuesDias ?? 0,
          prioridad: preset.prioridad
        }
      : { inicio: c.inicio, fin: c.fin }),
    // Contenido. Una campaña propia sin paleta mantiene los colores de la tienda.
    paleta: c.paleta ?? base.paleta ?? null,
    topBar: c.topBar ?? base.topBar ?? null,
    hero: {
      titulo: c.hero?.titulo ?? base.hero?.titulo ?? null,
      subtitulo: c.hero?.subtitulo ?? base.hero?.subtitulo ?? null,
      textoBoton: c.hero?.textoBoton ?? base.hero?.textoBoton ?? null
    },
    cinta: c.cinta ?? base.cinta ?? null,
    oferta: c.oferta === false ? null : c.oferta ?? base.oferta ?? null,
    widgets: c.widgets ?? base.widgets ?? []
  };
}

/**
 * Widgets que se muestran (R4.6): los permanentes de la tienda y, encima,
 * los de la campaña, que reemplazan al de su misma ancla. Uno por ancla, en
 * orden de ancla para que la respuesta sea estable.
 */
export function mezclarWidgets(permanentes = [], deCampana = []) {
  const porAncla = new Map();
  for (const w of [...(permanentes ?? []), ...(deCampana ?? [])]) porAncla.set(w.ancla, w);
  return ANCLAS_ORDEN.filter((a) => porAncla.has(a)).map((a) => porAncla.get(a));
}

/**
 * Campaña vigente en `ahora` entre las activas de la tienda, lista para el
 * storefront, o null (R3.1, R3.3).
 */
export function resolverCampana(campanasTienda = [], widgetsTienda = [], ahora) {
  const activas = (campanasTienda ?? [])
    .filter((c) => c.activa)
    .map(efectiva)
    .filter(Boolean);

  const v = vigente(activas, ahora);
  if (!v) return null;

  const { campana: c } = v;
  return {
    id: c.id,
    presetId: c.presetId,
    nombre: c.nombre,
    inicio: aIsoLima(v.inicio),
    fechaClave: aIsoLima(v.fechaClave),
    fin: aIsoLima(v.fin),
    paleta: c.paleta,
    topBar: c.topBar,
    hero: c.hero,
    cinta: c.cinta,
    oferta: c.oferta,
    widgets: mezclarWidgets(widgetsTienda, c.widgets)
  };
}

/**
 * Diseño tal como lo recibe el storefront en `ahora`: sin la lista de
 * campañas (nunca se publican las futuras) y con la vigente resuelta.
 * `tipoNegocio` elige la estructura por defecto (docs/specs/diseno-por-rubro).
 */
export function disenoPublico(diseno = {}, ahora, tipoNegocio) {
  // tema/estructura viajan resueltos en `tema` (docs/specs/estructura-tienda);
  // la estructura anterior (para "Deshacer") es solo del admin.
  // Las traducciones se aplican en la ruta pública según ?lang (hospedaje-completo C3).
  const { campanas, tema, estructura, estructura_anterior, traducciones, ...publico } = diseno;
  return {
    ...publico,
    campana: resolverCampana(campanas, publico.widgets, ahora),
    tema: resolverTema({ tema, estructura, hero: publico.hero, tipoNegocio }, ahora)
  };
}

/**
 * Calendario de un año para el admin (R2.5): cada preset con su ventana,
 * si la tienda lo activó y si se le sugiere por su rubro, más las campañas
 * propias que tocan ese año. Ordenado por fecha de inicio.
 */
export function calendarioAnual(campanasTienda = [], rubro, anio) {
  const porPreset = new Map((campanasTienda ?? []).filter((c) => c.presetId).map((c) => [c.presetId, c]));

  const presets = CAMPANA_PRESETS.map((preset) => {
    const propia = porPreset.get(preset.id);
    const v = ventana(propia ? efectiva(propia) : preset, anio);
    return {
      presetId: preset.id,
      campanaId: propia?.id ?? null,
      nombre: preset.nombre,
      activa: propia?.activa ?? false,
      personalizada: Boolean(propia),
      sugerida: sugeridoPara(preset, rubro),
      inicio: aIsoLima(v.inicio),
      fechaClave: aIsoLima(v.fechaClave),
      fin: aIsoLima(v.fin)
    };
  });

  const propias = (campanasTienda ?? [])
    .filter((c) => !c.presetId)
    .map((c) => ({ c, v: ventana(c) }))
    // Toca el año si empieza o termina en él (una liquidación 28 dic - 3 ene sale en ambos).
    .filter(({ v }) => v && [v.inicio, v.fechaClave].some((d) => aIsoLima(d).startsWith(`${anio}-`)))
    .map(({ c, v }) => ({
      presetId: null,
      campanaId: c.id,
      nombre: c.nombre,
      activa: c.activa,
      personalizada: true,
      sugerida: false,
      inicio: aIsoLima(v.inicio),
      fechaClave: aIsoLima(v.fechaClave),
      fin: aIsoLima(v.fin)
    }));

  return [...presets, ...propias].sort((a, b) => a.inicio.localeCompare(b.inicio));
}
