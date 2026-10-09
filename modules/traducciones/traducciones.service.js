import config from "../../config/index.js";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { getDiseno, upsertClave } from "../../services/tienda-diseno.service.js";
import { iaDisponible, traducirTextos } from "./traducir-ia.js";

/**
 * Contenido de la tienda en inglés (docs/specs/hospedaje-completo C3).
 *
 * Cada fila traducible guarda en su columna `traducciones`:
 *   { en: { campo: { t: texto en inglés, o: español del que salió, m: corregido a mano } } }
 * (para listas como los servicios de una habitación, `t` y `o` son listas).
 * El diseño (textos de las secciones y la descripción de la tienda) va en la
 * clave "traducciones" de la configuración de diseño, con claves de ruta
 * ("s.hero.titulo", "s.faq.items.2.respuesta").
 * La ficha de un tour (itinerario, incluye, tipos de pasajero…) se guarda en
 * la columna del producto, con claves propias ("incluye",
 * "itinerario.0.titulo", "pasajero.<id>"): es 1:1 con el producto.
 *
 * Estados: falta (sin inglés), al_dia (`o` = español actual), desactualizada
 * (cambió el español). La IA traduce lo que falta y vuelve a traducir lo
 * desactualizado que era automático; lo corregido a mano no lo toca: queda
 * marcado para que el dueño lo revise. La tienda muestra el inglés si está al
 * día o si es manual; si no, el español.
 */

const IDIOMA = "en";
const usuarioDe = (user) => user?.email ?? user?.id ?? null;

// ── Fuentes: qué se traduce de cada tabla ───────────────────────────────

const FUENTES = {
  productos: {
    tabla: "productos", pk: "id", campos: ["nombre", "descripcionCorta", "descripcion"], etiqueta: "Nombre y descripción",
    where: (tiendaId) => ({ tiendaId, activo: true }), nombre: (f) => f.nombre
  },
  // Ficha del tour: se guarda en `productos.traducciones` (ver textosTour).
  tours: {
    tabla: "productos", pk: "id", etiqueta: "Ficha del tour",
    where: (tiendaId) => ({ tiendaId, activo: true, tour: { isNot: null } }),
    select: {
      nombre: true,
      tour: {
        select: {
          duracion: true, incluye: true, noIncluye: true, queLlevar: true, requisitos: true, puntoEncuentro: true, recojo: true, itinerario: true,
          tiposPasajero: { where: { activo: true }, select: { id: true, nombre: true }, orderBy: { orden: "asc" } }
        }
      }
    },
    textos: (f) => textosTour(f.tour),
    nombre: (f) => f.nombre
  },
  categorias: {
    tabla: "categorias", pk: "id", campos: ["nombre", "descripcion"], etiqueta: "Categoría",
    where: (tiendaId) => ({ tiendaId, activo: true }), nombre: (f) => f.nombre
  },
  habitaciones: {
    tabla: "hotel_tipos_habitacion", pk: "productoId", campos: ["camas", "amenities"], etiqueta: "Ficha de habitación",
    where: (tiendaId) => ({ tiendaId }), incluir: { producto: { select: { nombre: true } } }, nombre: (f) => f.producto?.nombre
  },
  extras: {
    tabla: "hotel_extras", pk: "id", campos: ["nombre", "descripcion", "datoPedido"], etiqueta: "Extra",
    where: (tiendaId) => ({ tiendaId }), nombre: (f) => f.nombre
  },
  temporadas: {
    tabla: "hotel_temporadas", pk: "id", campos: ["nombre"], etiqueta: "Temporada",
    where: (tiendaId) => ({ tiendaId }), nombre: (f) => f.nombre
  },
  planes: {
    tabla: "hotel_planes", pk: "id", campos: ["nombre", "descripcion"], etiqueta: "Plan de tarifa",
    where: (tiendaId) => ({ tiendaId }), nombre: (f) => f.nombre
  },
  config: {
    tabla: "config_reservas", pk: "tiendaId", campos: ["instrucciones", "politicaCancelacion"], etiqueta: "Configuración de reservas",
    where: (tiendaId) => ({ tiendaId }), nombre: () => "Reservas"
  }
};

/** Textos de una fila: los de `textos(fila)` o, por defecto, sus columnas `campos`. */
const textosDe = (f, fila) => (f.textos ? f.textos(fila) : Object.fromEntries(f.campos.map(c => [c, fila[c]])));
const selectDe = (f) => ({
  [f.pk]: true, traducciones: true, ...(f.select ?? Object.fromEntries(f.campos.map(c => [c, true]))), ...(f.incluir ?? {})
});

const vacio = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Estado de la traducción de un campo frente a su español actual. */
export function estadoCampo(es, tr) {
  if (vacio(es)) return null;
  if (!tr || vacio(tr.t)) return "falta";
  return igual(tr.o, es) ? "al_dia" : "desactualizada";
}

/** Texto a mostrar en inglés: la traducción al día o la manual; si no, el español. */
export function textoEn(es, tr) {
  if (vacio(es) || !tr || vacio(tr.t)) return es;
  if (tr.m || igual(tr.o, es)) {
    // Una lista manual de otro largo que el español: se respeta igual.
    return tr.t;
  }
  return es;
}

/** Aplica el inglés a una fila (sin tocar la original). */
export function traducirFila(fila, campos, lang) {
  if (lang !== IDIOMA || !fila) return fila;
  const tr = fila.traducciones?.[IDIOMA] ?? {};
  const copia = { ...fila };
  for (const c of campos) copia[c] = textoEn(fila[c], tr[c]);
  return copia;
}

// ── Tours: la ficha, guardada en la columna del producto ───────────────

const CAMPOS_TOUR = ["duracion", "incluye", "noIncluye", "queLlevar", "requisitos", "puntoEncuentro", "recojo"];

/** Textos traducibles de la ficha de un tour: { incluye: [...], "itinerario.0.titulo": "…", "pasajero.<id>": "Adulto" }. */
export function textosTour(t) {
  if (!t) return {};
  const textos = Object.fromEntries(CAMPOS_TOUR.map(c => [c, t[c] ?? null]));
  (Array.isArray(t.itinerario) ? t.itinerario : []).forEach((p, i) => {
    textos[`itinerario.${i}.titulo`] = p?.titulo ?? null;
    textos[`itinerario.${i}.descripcion`] = p?.descripcion ?? null;
  });
  for (const tp of t.tiposPasajero ?? []) textos[`pasajero.${tp.id}`] = tp.nombre;
  return textos;
}

/** Copia del tour con su ficha en inglés; `traducciones` es la columna del producto. */
export function traducirTour(tour, traducciones, lang) {
  if (lang !== IDIOMA || !tour) return tour;
  const tr = traducciones?.[IDIOMA] ?? {};
  const en = (clave, es) => textoEn(es, tr[clave]);
  const copia = { ...tour };
  for (const c of CAMPOS_TOUR) if (c in tour) copia[c] = en(c, tour[c]);
  if (Array.isArray(tour.itinerario)) {
    copia.itinerario = tour.itinerario.map((p, i) => ({
      ...p, titulo: en(`itinerario.${i}.titulo`, p?.titulo), descripcion: en(`itinerario.${i}.descripcion`, p?.descripcion)
    }));
  }
  if (Array.isArray(tour.tiposPasajero)) {
    copia.tiposPasajero = tour.tiposPasajero.map(tp => ({ ...tp, nombre: en(`pasajero.${tp.id}`, tp.nombre) }));
  }
  return copia;
}

// ── Diseño: textos de las secciones ────────────────────────────────────

const CAMPOS_SECCION = ["titulo", "subtitulo", "texto", "kicker", "textoBoton"];
const CAMPOS_ITEM = ["titulo", "texto", "pregunta", "respuesta"];

/** Textos traducibles del diseño: { "s.<id>.titulo": "…", "tienda.descripcion": "…" }. */
export function textosDiseno(estructura, descripcion) {
  const textos = {};
  if (!vacio(descripcion)) textos["tienda.descripcion"] = descripcion;
  for (const s of estructura?.home?.secciones ?? []) {
    if (s.oculto) continue;
    for (const c of CAMPOS_SECCION) if (!vacio(s[c])) textos[`s.${s.id}.${c}`] = s[c];
    (s.items ?? []).forEach((it, i) => {
      if (typeof it === "string") { if (!vacio(it)) textos[`s.${s.id}.items.${i}`] = it; return; }
      if (s.tipo === "testimonios") return; // palabras de los huéspedes: no se traducen
      for (const c of CAMPOS_ITEM) if (!vacio(it[c])) textos[`s.${s.id}.items.${i}.${c}`] = it[c];
    });
    (s.cercanos ?? []).forEach((c, i) => { if (!vacio(c)) textos[`s.${s.id}.cercanos.${i}`] = c; });
    (s.fotos ?? []).forEach((f, i) => { if (!vacio(f.pie)) textos[`s.${s.id}.fotos.${i}.pie`] = f.pie; });
  }
  return textos;
}

/** Copia de la estructura con los textos en inglés (los que estén al día o sean manuales). */
export function aplicarDisenoEn(estructura, tr) {
  if (!estructura || !tr) return estructura;
  const en = (clave, es) => textoEn(es, tr[clave]);
  return {
    ...estructura,
    home: {
      ...estructura.home,
      secciones: estructura.home.secciones.map(s => {
        const t = { ...s };
        for (const c of CAMPOS_SECCION) if (!vacio(s[c])) t[c] = en(`s.${s.id}.${c}`, s[c]);
        if (Array.isArray(s.items) && s.tipo !== "testimonios") {
          t.items = s.items.map((it, i) => (typeof it === "string"
            ? en(`s.${s.id}.items.${i}`, it)
            : Object.fromEntries(Object.entries(it).map(([k, v]) => [k, CAMPOS_ITEM.includes(k) && !vacio(v) ? en(`s.${s.id}.items.${i}.${k}`, v) : v]))));
        }
        if (Array.isArray(s.cercanos)) t.cercanos = s.cercanos.map((c, i) => en(`s.${s.id}.cercanos.${i}`, c));
        if (Array.isArray(s.fotos)) t.fotos = s.fotos.map((f, i) => ({ ...f, pie: f.pie ? en(`s.${s.id}.fotos.${i}.pie`, f.pie) : f.pie }));
        return t;
      })
    }
  };
}

async function traduccionesDiseno(tiendaId) {
  const d = await getDiseno(tiendaId);
  return { estructura: d.estructura, tr: d.traducciones?.[IDIOMA] ?? {} };
}

// ── Listado para el admin ──────────────────────────────────────────────

async function tiendaConIdiomas(tiendaId) {
  const t = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { id: true, nombre: true, tipoNegocio: true, idiomas: true, descripcion: true } });
  if (!t) throw new NotFoundError("Tienda");
  return t;
}

/**
 * Todos los textos traducibles de la tienda, agrupados por de dónde salen,
 * con su estado. Es lo que muestra la pantalla Traducciones del admin.
 */
export async function listarTextos(tiendaId) {
  const tienda = await tiendaConIdiomas(tiendaId);
  const grupos = [];
  for (const [fuente, f] of Object.entries(FUENTES)) {
    const filas = await prisma[f.tabla].findMany({ where: f.where(tiendaId), select: selectDe(f) });
    for (const fila of filas) {
      const tr = fila.traducciones?.[IDIOMA] ?? {};
      const campos = Object.entries(textosDe(f, fila))
        .map(([c, es]) => ({ campo: c, es, en: tr[c]?.t ?? null, manual: !!tr[c]?.m, estado: estadoCampo(es, tr[c]) }))
        .filter(c => c.estado);
      if (campos.length) grupos.push({ fuente, id: fila[f.pk], etiqueta: f.etiqueta, nombre: f.nombre(fila) ?? "", campos });
    }
  }
  const { estructura, tr } = await traduccionesDiseno(tiendaId);
  const textos = textosDiseno(estructura, tienda.descripcion);
  const campos = Object.entries(textos).map(([clave, es]) => ({
    campo: clave, es, en: tr[clave]?.t ?? null, manual: !!tr[clave]?.m, estado: estadoCampo(es, tr[clave])
  }));
  if (campos.length) grupos.push({ fuente: "diseno", id: tiendaId, etiqueta: "Página de inicio", nombre: tienda.nombre, campos });

  const todos = grupos.flatMap(g => g.campos);
  return {
    idiomas: tienda.idiomas ?? ["es"],
    iaDisponible: iaDisponible(),
    resumen: {
      total: todos.length,
      faltan: todos.filter(c => c.estado === "falta").length,
      desactualizadas: todos.filter(c => c.estado === "desactualizada").length
    },
    grupos
  };
}

// ── Escritura ──────────────────────────────────────────────────────────

/** El dueño corrige (o borra, con texto vacío) una traducción: queda como manual. */
export async function guardarManual(tiendaId, { fuente, id, campo, texto }, user) {
  const limpio = Array.isArray(texto) ? texto.map(t => String(t).trim()).filter(Boolean) : String(texto ?? "").trim();
  if (fuente === "diseno") {
    const tienda = await tiendaConIdiomas(tiendaId);
    const { estructura, tr } = await traduccionesDiseno(tiendaId);
    const es = textosDiseno(estructura, tienda.descripcion)[campo];
    if (es === undefined) throw new NotFoundError("Texto");
    const nuevo = { ...tr };
    if (vacio(limpio)) delete nuevo[campo];
    else nuevo[campo] = { t: limpio, o: es, m: true };
    await upsertClave(tiendaId, "traducciones", { [IDIOMA]: nuevo }, usuarioDe(user));
    return;
  }
  const f = FUENTES[fuente];
  const noTraducible = () => { const message = "Campo no traducible"; return new ValidationError(message, { message }); };
  if (!f) throw noTraducible();
  const fila = await prisma[f.tabla].findFirst({ where: { ...f.where(tiendaId), [f.pk]: id }, select: selectDe(f) });
  if (!fila) throw new NotFoundError("Texto");
  const textos = textosDe(f, fila);
  if (!Object.hasOwn(textos, campo)) throw noTraducible();
  const tr = { ...(fila.traducciones?.[IDIOMA] ?? {}) };
  if (vacio(limpio)) delete tr[campo];
  else tr[campo] = { t: limpio, o: textos[campo], m: true };
  await prisma[f.tabla].update({ where: { [f.pk]: id }, data: { traducciones: { ...(fila.traducciones ?? {}), [IDIOMA]: tr } } });
}

/** Clave plana de un texto pendiente; las listas se traducen elemento por elemento. */
const claveDe = (fuente, id, campo, i = null) => `${fuente}|${id}|${campo}${i === null ? "" : `#${i}`}`;

/**
 * Traduce con IA lo que falta y lo automático desactualizado (no toca lo
 * manual). Devuelve cuántos campos tradujo.
 */
export async function traducirPendientes(tiendaId) {
  const tienda = await tiendaConIdiomas(tiendaId);
  if (!(tienda.idiomas ?? []).includes(IDIOMA) || !iaDisponible()) return 0;

  const pendientes = {};          // clave plana → español
  const destinos = [];            // { fuente, id, campo, es, lista }
  for (const [fuente, f] of Object.entries(FUENTES)) {
    const filas = await prisma[f.tabla].findMany({ where: f.where(tiendaId), select: selectDe(f) });
    for (const fila of filas) {
      const tr = fila.traducciones?.[IDIOMA] ?? {};
      for (const [c, es] of Object.entries(textosDe(f, fila))) {
        const estado = estadoCampo(es, tr[c]);
        if (!estado || estado === "al_dia" || tr[c]?.m) continue;
        if (Array.isArray(es)) es.forEach((v, i) => { pendientes[claveDe(fuente, fila[f.pk], c, i)] = v; });
        else pendientes[claveDe(fuente, fila[f.pk], c)] = es;
        destinos.push({ fuente, id: fila[f.pk], campo: c, es, lista: Array.isArray(es) });
      }
    }
  }
  const { estructura, tr: trDiseno } = await traduccionesDiseno(tiendaId);
  const textos = textosDiseno(estructura, tienda.descripcion);
  for (const [clave, es] of Object.entries(textos)) {
    const estado = estadoCampo(es, trDiseno[clave]);
    if (estado === "al_dia" || trDiseno[clave]?.m) continue;
    pendientes[claveDe("diseno", tiendaId, clave)] = es;
    destinos.push({ fuente: "diseno", id: tiendaId, campo: clave, es, lista: false });
  }
  if (!destinos.length) return 0;

  const contexto = `${tienda.nombre} (${tienda.tipoNegocio})`;
  const en = await traducirTextos(pendientes, contexto);

  // Escribe fila por fila lo que volvió completo (una lista, con todos sus elementos).
  let traducidos = 0;
  const porFila = new Map();
  for (const d of destinos) {
    const t = d.lista ? d.es.map((_, i) => en[claveDe(d.fuente, d.id, d.campo, i)]) : en[claveDe(d.fuente, d.id, d.campo)];
    if (d.lista ? t.some(x => !x) : !t) continue;
    const k = `${d.fuente}|${d.id}`;
    if (!porFila.has(k)) porFila.set(k, { fuente: d.fuente, id: d.id, campos: {} });
    porFila.get(k).campos[d.campo] = { t, o: d.es, m: false };
    traducidos++;
  }
  for (const { fuente, id, campos } of porFila.values()) {
    if (fuente === "diseno") {
      const { tr } = await traduccionesDiseno(tiendaId);
      await upsertClave(tiendaId, "traducciones", { [IDIOMA]: { ...tr, ...campos } }, "traducciones-ia");
      continue;
    }
    const f = FUENTES[fuente];
    const fila = await prisma[f.tabla].findUnique({ where: { [f.pk]: id }, select: { traducciones: true } });
    if (!fila) continue;
    const actual = fila.traducciones?.[IDIOMA] ?? {};
    // Una corrección manual hecha mientras traducía la IA gana.
    const sinPisar = Object.fromEntries(Object.entries(campos).filter(([c]) => !actual[c]?.m));
    await prisma[f.tabla].update({ where: { [f.pk]: id }, data: { traducciones: { ...(fila.traducciones ?? {}), [IDIOMA]: { ...actual, ...sinPisar } } } });
  }
  logger.info(`🌐 Traducciones: ${traducidos} textos traducidos en ${tienda.nombre}`);
  return traducidos;
}

// ── Disparo tras guardar en el admin ───────────────────────────────────

const programadas = new Map();

/**
 * Programa la traducción de la tienda unos segundos después del último
 * guardado (varios cambios seguidos se traducen juntos). Nunca lanza.
 */
export function programarTraduccion(tiendaId) {
  if (!tiendaId || config.nodeEnv === "test" || !iaDisponible()) return;
  clearTimeout(programadas.get(tiendaId));
  const id = setTimeout(() => {
    programadas.delete(tiendaId);
    traducirPendientes(tiendaId).catch(error => logger.warn(`🌐 Traducciones: falló en ${tiendaId}: ${error.message}`));
  }, config.traducciones.demoraMs);
  id.unref?.();
  programadas.set(tiendaId, id);
}

/** Middleware de los routers de admin: tras un POST/PUT/PATCH/DELETE exitoso, programa la traducción. */
export function traducirTrasGuardar(req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.on("finish", () => {
      const tiendaId = req.tiendaId ?? req.body?.tiendaId ?? req.originalUrl.match(/\/tiendas\/([0-9a-f-]{36})/i)?.[1];
      if (res.statusCode < 400 && tiendaId) programarTraduccion(tiendaId);
    });
  }
  next();
}
