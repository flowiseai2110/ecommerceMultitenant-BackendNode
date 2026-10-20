// Resolución de campañas — lógica pura (sin BD ni reloj) para poder testearla.
//
// La tienda guarda personalizaciones (claves "campanas" y "widgets" de
// tienda_configuraciones); aquí se mezclan con los presets y se arma lo que
// recibe el storefront: la campaña vigente ya resuelta, con fechas en hora
// de Lima. Ver docs/specs/campanas-widgets (R3, R4.6, R6).

import { CAMPANA_PRESETS, buscarPreset, sugeridoPara } from "./presets.js";
import { aIsoLima, proximoCambio, ventanas, ventanaEfecto, vigente } from "./calendario.js";
import { resolverTema } from "../diseno/resolver.js";
import { datosDe } from "../negocio/datos.js";
import { usoResuelto } from "./uso.js";

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
    // Un preset con "Mis fechas" (campanas-cuando R2.9) usa las fechas de la
    // tienda como una propia y conserva la prioridad y el aspecto del preset.
    ...(preset && c.inicio && c.fin
      ? { inicio: c.inicio, fin: c.fin, prioridad: preset.prioridad }
      : preset
      ? {
          regla: preset.regla,
          anticipacionDias: c.anticipacionDias ?? preset.anticipacionDias,
          despuesDias: c.despuesDias ?? preset.despuesDias ?? 0,
          prioridad: preset.prioridad
        }
      : { inicio: c.inicio, fin: c.fin }),
    // Horas (R3): null = día completo. Valen para el primer y el último día.
    horaInicio: c.horaInicio ?? null,
    horaFin: c.horaFin ?? null,
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
    widgets: c.widgets ?? base.widgets ?? [],
    // Efecto festivo (docs/specs/efectos-festivos). Una propia empieza sin efecto (E1.4).
    efecto: c.efecto ?? base.efecto ?? "ninguno",
    efectoModo: c.efectoModo ?? "clave",
    diasEfecto: base.diasEfecto ?? [0],
    saludo: c.saludo ?? base.saludo ?? null,
    // Ventana de uso (R1): sin resolver todavía; ver usoResuelto().
    uso: c.uso ?? null
  };
}

/**
 * Efecto que el storefront reproduce en `ahora` (E2.1, E2.3): `{ tipo, saludo }`
 * si hoy cae en su ventana, o null. "ninguno" con saludo deja solo el saludo.
 */
export function efectoVigente(c, v, ahora) {
  const saludo = c.saludo?.trim() || null;
  if (c.efecto === "ninguno" && !saludo) return null;
  const w = ventanaEfecto(c, v);
  if (!w || ahora < w.inicio || ahora >= w.fin) return null;
  return { tipo: c.efecto, saludo };
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
 * Campañas de la tienda que aplican, ya mezcladas con su preset. Punto único
 * donde, a futuro, entra el contexto (p. ej. la sede, docs/specs/multi-sede);
 * hoy no filtra por nada más que `activa`.
 */
export function campanasAplicables(campanasTienda = [], _contexto = {}) {
  return (campanasTienda ?? [])
    .filter((c) => c.activa)
    .map(efectiva)
    .filter(Boolean);
}

/**
 * Campaña vigente en `ahora` entre las activas de la tienda, lista para el
 * storefront, o null (R3.1, R3.3).
 */
export function resolverCampana(campanasTienda = [], widgetsTienda = [], ahora, ediciones = null, conUso = false) {
  const v = vigente(campanasAplicables(campanasTienda), ahora, ediciones);
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
    widgets: mezclarWidgets(widgetsTienda, c.widgets),
    efecto: efectoVigente(c, v, ahora),
    // Solo en rubros que reciben reservas (R1.1); sin ventana de uso, la clave no viaja.
    ...(conUso ? conClaveUso(usoResuelto(c.uso, Boolean(c.presetId), v)) : {})
  };
}

/**
 * Próximo instante (Date) en que cambia la campaña que ve la tienda, o null
 * (R3.9.1). La tienda programa su recarga a esa hora.
 */
export function proximoCambioDe(campanasTienda = [], ahora, ediciones = null) {
  return proximoCambio(campanasAplicables(campanasTienda), ahora, ediciones);
}

/**
 * Diseño tal como lo recibe el storefront en `ahora`: sin la lista de
 * campañas (nunca se publican las futuras) y con la vigente resuelta.
 * `tipoNegocio` elige la estructura por defecto (docs/specs/diseno-por-rubro).
 * `ediciones` son las fechas por año de la plataforma (R2); sin ellas, el Cyber Wow no aparece.
 */
export function disenoPublico(diseno = {}, ahora, tipoNegocio, ediciones = null) {
  // tema/estructura viajan resueltos en `tema` (docs/specs/estructura-tienda);
  // la estructura anterior (para "Deshacer") es solo del admin.
  // Las traducciones se aplican en la ruta pública según ?lang (hospedaje-completo C3).
  const { campanas, tema, estructura, estructura_anterior, traducciones, ...publico } = diseno;
  return {
    ...publico,
    campana: resolverCampana(campanas, publico.widgets, ahora, ediciones, datosDe(tipoNegocio).recibeReservas),
    tema: resolverTema({ tema, estructura, hero: publico.hero, tipoNegocio }, ahora)
  };
}

/**
 * Calendario de un año para el admin (R2.5): cada preset con su ventana,
 * si la tienda lo activó y si se le sugiere por su rubro, más las campañas
 * propias que tocan ese año. Ordenado por fecha de inicio. Una fila "por año"
 * trae una ventana por edición cargada, las `ediciones` (solo lectura para el
 * dueño, decisión I) y las que `porAnunciar` (R2.6.2).
 */
export function calendarioAnual(campanasTienda = [], rubro, anio, ediciones = null, conUso = false) {
  const porPreset = new Map((campanasTienda ?? []).filter((c) => c.presetId).map((c) => [c.presetId, c]));

  const presets = CAMPANA_PRESETS.map((preset) => {
    const propia = porPreset.get(preset.id);
    const ef = efectiva(propia ?? { id: null, presetId: preset.id });
    // Si las horas dejaran la ventana vacía (el schema lo impide al guardar), se muestra sin horas.
    const misFechas = !ef.regla;
    const lista = ventanas(ef, anio, ediciones);
    const vs = lista.length || misFechas || preset.regla.tipo === "porAnio"
      ? lista
      : ventanas({ ...ef, horaInicio: null, horaFin: null }, anio);
    const v = vs[0] ?? null;
    return {
      presetId: preset.id,
      campanaId: propia?.id ?? null,
      nombre: preset.nombre,
      activa: propia?.activa ?? false,
      personalizada: Boolean(propia),
      sugerida: sugeridoPara(preset, rubro),
      misFechas,
      ...datosVentana(vs, ef),
      ...datosEfecto(ef, v),
      ...(conUso ? conClaveUso(usoResuelto(ef.uso, true, v)) : {}),
      ...(preset.regla.tipo === "porAnio" ? datosEdiciones(preset, anio, ediciones) : {})
    };
  });

  const propias = (campanasTienda ?? [])
    .filter((c) => !c.presetId)
    .map((c) => ({ c, v: ventanas(efectiva(c))[0] }))
    // Toca el año si empieza o termina en él (una liquidación 28 dic - 3 ene sale en ambos).
    .filter(({ v }) => v && [v.inicio, v.fechaClave].some((d) => aIsoLima(d).startsWith(`${anio}-`)))
    .map(({ c, v }) => ({
      presetId: null,
      campanaId: c.id,
      nombre: c.nombre,
      activa: c.activa,
      personalizada: true,
      sugerida: false,
      ...datosVentana([v], efectiva(c)),
      ...datosEfecto(efectiva(c), v),
      ...(conUso ? conClaveUso(usoResuelto(c.uso, false, v)) : {})
    }));

  return [...presets, ...propias].sort((a, b) => claveOrden(a, anio).localeCompare(claveOrden(b, anio)));
}

/** `{ uso }` si lo hay; sin ventana de uso la clave no viaja. */
const conClaveUso = (uso) => (uso ? { uso } : {});

/** Orden de una fila: su inicio; una "por año" sin fechas, el mes de su primera edición esperada. */
function claveOrden(fila, anio) {
  if (fila.inicio) return fila.inicio;
  const mes = fila.porAnunciar?.[0]?.mes ?? 12;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

/**
 * Ediciones de una campaña "por año" en ese año: las cargadas (con su fecha y
 * hora, para la lista de solo lectura) y las esperadas que faltan (R2.6.2).
 */
function datosEdiciones(preset, anio, ediciones) {
  const delAnio = (ediciones ?? []).filter((e) => e.presetId === preset.id && e.anio === anio);
  const cargadas = new Set(delAnio.map((e) => e.clave));
  return {
    ediciones: delAnio
      .map(({ clave, nombre, inicio, horaInicio, fin, horaFin }) => ({ clave, nombre, inicio, horaInicio, fin, horaFin }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    porAnunciar: preset.regla.edicionesEsperadas.filter((e) => !cargadas.has(e.clave))
  };
}

/**
 * Fechas de una fila del calendario: `ventanas[]` y, para el Admin anterior,
 * `inicio/fechaClave/fin` de la primera. Las horas viajan para mostrarlas.
 */
function datosVentana(vs, c) {
  const iso = (v) => ({
    inicio: aIsoLima(v.inicio),
    fechaClave: aIsoLima(v.fechaClave),
    fin: aIsoLima(v.fin),
    ...(v.edicion ? { edicion: v.edicion } : {})
  });
  // Una campaña "por año" sin ediciones cargadas no tiene fechas: "por anunciar".
  if (!vs.length) return { inicio: null, fechaClave: null, fin: null, horaInicio: c.horaInicio, horaFin: c.horaFin, ventanas: [] };
  return { ...iso(vs[0]), horaInicio: c.horaInicio, horaFin: c.horaFin, ventanas: vs.map(iso) };
}

/** Efecto de una campaña en el calendario del admin (E4.1): días en que se ve. */
function datosEfecto(c, v) {
  const w = c.efecto === "ninguno" ? null : ventanaEfecto(c, v);
  return {
    efecto: c.efecto,
    efectoModo: c.efectoModo,
    saludo: c.saludo?.trim() || null,
    efectoInicio: w ? aIsoLima(w.inicio) : null,
    efectoFin: w ? aIsoLima(w.fin) : null
  };
}
