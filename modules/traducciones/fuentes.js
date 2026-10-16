import { almacenColumna, almacenDiseno, almacenTextosFijos } from "./almacenes.js";
import { textoLocal, vacio } from "./texto-local.js";
import { textoBase } from "../idiomas/textos.service.js";
import { ubicaciones } from "../idiomas/ubicaciones.js";

/**
 * Fuentes de texto traducible de la tienda (docs/specs/idiomas D5, diseno.md B4).
 * Única fuente de verdad de qué se traduce: la pantalla Traducciones del admin
 * y la tienda (`localizar`) leen los campos de aquí, sin repetir listas.
 *
 * Cada fuente:
 *   etiqueta          → cómo la ve el dueño en Traducciones
 *   almacen           → dónde guarda sus traducciones (almacenes.js)
 *   nombre(fila)      → el nombre de la fila en Traducciones
 *   textos(fila)      → { clave: texto base } de lo que se traduce
 *   aplicar(fila, tr) → copia de la fila con los textos de un idioma
 *   nombreCampo(campo) → cómo ve el dueño un campo ("Camas", "Itinerario, paso 2: título")
 *   lugar             → entrada de "Tu contenido" donde se muestra (CONTENIDO), o
 *   lugares(fila, campo, datos) → dónde se muestra cada campo en Traducciones
 *                       (diseno.md A1; `datos` son los del rubro de la tienda)
 */

/** Nombre de cada campo de texto en Traducciones (columnas y partes de la ficha o del diseño). */
const NOMBRES_CAMPO = {
  nombre: "Nombre", descripcion: "Descripción", descripcionCorta: "Descripción corta", camas: "Camas",
  amenities: "Servicios", datoPedido: "Dato que pides", instrucciones: "Instrucciones de llegada",
  politicaCancelacion: "Política de cancelación", titulo: "Título", subtitulo: "Subtítulo", texto: "Texto",
  kicker: "Antetítulo", textoBoton: "Botón", textoBotonSecundario: "Botón secundario", acento: "Texto destacado",
  campeonato: "Campeonato", nota: "Nota", pregunta: "Pregunta", respuesta: "Respuesta", pie: "Pie de foto",
  duracion: "Duración", incluye: "Incluye", noIncluye: "No incluye", queLlevar: "Qué llevar", requisitos: "Requisitos",
  puntoEncuentro: "Punto de encuentro", recojo: "Recojo"
};
const nombreDe = (campo) => NOMBRES_CAMPO[campo] ?? campo;

/** Fuente cuyas claves son columnas de la fila (el caso común). */
function fuenteCampos({ etiqueta, lugar, tabla, pk = "id", campos, where, nombre = (f) => f.nombre, incluir = {} }) {
  return {
    etiqueta,
    lugar,
    almacen: almacenColumna({ tabla, pk, where, select: { ...Object.fromEntries(campos.map((c) => [c, true])), ...incluir } }),
    nombre,
    nombreCampo: nombreDe,
    textos: (fila) => Object.fromEntries(campos.map((c) => [c, fila[c]])),
    aplicar: (fila, tr) => ({ ...fila, ...Object.fromEntries(campos.filter((c) => c in fila).map((c) => [c, textoLocal(fila[c], tr[c])])) })
  };
}

// ── Tours: la ficha va en la columna del producto, con claves propias ───

const CAMPOS_TOUR = ["duracion", "incluye", "noIncluye", "queLlevar", "requisitos", "puntoEncuentro", "recojo"];

/** Textos de la ficha de un tour: { incluye: [...], "itinerario.0.titulo": "…", "pasajero.<id>": "Adulto" }. */
export function textosTour(t) {
  if (!t) return {};
  const textos = Object.fromEntries(CAMPOS_TOUR.map((c) => [c, t[c] ?? null]));
  (Array.isArray(t.itinerario) ? t.itinerario : []).forEach((p, i) => {
    textos[`itinerario.${i}.titulo`] = p?.titulo ?? null;
    textos[`itinerario.${i}.descripcion`] = p?.descripcion ?? null;
  });
  for (const tp of t.tiposPasajero ?? []) textos[`pasajero.${tp.id}`] = tp.nombre;
  return textos;
}

/** "incluye" → "Incluye"; "itinerario.1.titulo" → "Itinerario, paso 2: título"; "pasajero.<id>" → "Tipo de pasajero". */
function nombreCampoTour(campo) {
  const [primero, i, parte] = campo.split(".");
  if (primero === "pasajero") return "Tipo de pasajero";
  if (primero === "itinerario") return `Itinerario, paso ${Number(i) + 1}: ${nombreDe(parte).toLowerCase()}`;
  return nombreDe(campo);
}

function aplicarTour(tour, tr) {
  if (!tour) return tour;
  const local = (clave, base) => textoLocal(base, tr[clave]);
  const copia = { ...tour };
  for (const c of CAMPOS_TOUR) if (c in tour) copia[c] = local(c, tour[c]);
  if (Array.isArray(tour.itinerario)) {
    copia.itinerario = tour.itinerario.map((p, i) => ({
      ...p, titulo: local(`itinerario.${i}.titulo`, p?.titulo), descripcion: local(`itinerario.${i}.descripcion`, p?.descripcion)
    }));
  }
  if (Array.isArray(tour.tiposPasajero)) {
    copia.tiposPasajero = tour.tiposPasajero.map((tp) => ({ ...tp, nombre: local(`pasajero.${tp.id}`, tp.nombre) }));
  }
  return copia;
}

// ── Diseño: textos de las secciones de la home ─────────────────────────

const CAMPOS_SECCION = ["titulo", "subtitulo", "texto", "kicker", "textoBoton", "textoBotonSecundario", "acento", "campeonato", "nota"];
const CAMPOS_ITEM = ["titulo", "texto", "pregunta", "respuesta"];

/**
 * Clasificación de todo campo de texto de las secciones (contrato 8,
 * __tests__/diseno-campos.test.js): o se traduce, o está aquí con su motivo.
 * Un campo nuevo en secciones.schema.js hace fallar el test hasta clasificarlo.
 */
export const CAMPOS_DISENO_TRADUCIBLES = Object.freeze([
  ...CAMPOS_SECCION, ...CAMPOS_ITEM.map((c) => `items[].${c}`), "items[]", "cercanos[]", "fotos[].pie"
]);
export const CAMPOS_DISENO_NO_TRADUCIBLES = Object.freeze({
  id: "identificador de la sección",
  imagenUrl: "URL",
  "fotos[].url": "URL",
  terminaEn: "fecha",
  "items[].nombre": "nombre de quien dejó el testimonio",
  "items[].ciudad": "ciudad de quien dejó el testimonio",
  "equipos[].nombre": "nombre propio de un equipo"
});

/** Textos del diseño: { "s.<id>.titulo": "…", "tienda.descripcion": "…" }. */
export function textosDiseno(estructura, descripcion) {
  const textos = {};
  if (!vacio(descripcion)) textos["tienda.descripcion"] = descripcion;
  for (const s of estructura?.home?.secciones ?? []) {
    if (s.oculto) continue;
    for (const c of CAMPOS_SECCION) if (!vacio(s[c])) textos[`s.${s.id}.${c}`] = s[c];
    (s.items ?? []).forEach((it, i) => {
      if (typeof it === "string") { if (!vacio(it)) textos[`s.${s.id}.items.${i}`] = it; return; }
      if (s.tipo === "testimonios") return; // palabras de los clientes: no se traducen
      for (const c of CAMPOS_ITEM) if (!vacio(it[c])) textos[`s.${s.id}.items.${i}.${c}`] = it[c];
    });
    (s.cercanos ?? []).forEach((c, i) => { if (!vacio(c)) textos[`s.${s.id}.cercanos.${i}`] = c; });
    (s.fotos ?? []).forEach((f, i) => { if (!vacio(f.pie)) textos[`s.${s.id}.fotos.${i}.pie`] = f.pie; });
  }
  return textos;
}

/**
 * "tienda.descripcion" → "Descripción de la tienda"; "s.faq.items.1.pregunta" →
 * "Pregunta (2)"; "s.cerca.cercanos.0" → "Lugar cercano 1"; "s.hero.titulo" → "Título".
 */
function nombreCampoDiseno(campo) {
  if (campo === "tienda.descripcion") return "Descripción de la tienda";
  const partes = campo.split(".");
  const ultimo = partes.at(-1);
  if (/^\d+$/.test(ultimo)) return `${partes.at(-2) === "cercanos" ? "Lugar cercano" : "Elemento"} ${Number(ultimo) + 1}`;
  const i = partes.indexOf("items");
  return i >= 0 && partes[i + 1] ? `${nombreDe(ultimo)} (${Number(partes[i + 1]) + 1})` : nombreDe(ultimo);
}

/** Copia de la estructura con los textos de un idioma (al día o manuales). */
export function aplicarDiseno(estructura, tr) {
  if (!estructura?.home) return estructura;
  const local = (clave, base) => textoLocal(base, tr[clave]);
  return {
    ...estructura,
    home: {
      ...estructura.home,
      secciones: estructura.home.secciones.map((s) => {
        const t = { ...s };
        for (const c of CAMPOS_SECCION) if (!vacio(s[c])) t[c] = local(`s.${s.id}.${c}`, s[c]);
        if (Array.isArray(s.items) && s.tipo !== "testimonios") {
          t.items = s.items.map((it, i) => (typeof it === "string"
            ? local(`s.${s.id}.items.${i}`, it)
            : Object.fromEntries(Object.entries(it).map(([k, v]) => [k, CAMPOS_ITEM.includes(k) && !vacio(v) ? local(`s.${s.id}.items.${i}.${k}`, v) : v]))));
        }
        if (Array.isArray(s.cercanos)) t.cercanos = s.cercanos.map((c, i) => local(`s.${s.id}.cercanos.${i}`, c));
        if (Array.isArray(s.fotos)) t.fotos = s.fotos.map((f, i) => ({ ...f, pie: f.pie ? local(`s.${s.id}.fotos.${i}.pie`, f.pie) : f.pie }));
        return t;
      })
    }
  };
}

// ── Dónde se muestra cada texto en Traducciones (diseno.md A1) ─────────

/**
 * Entradas de "Tu contenido", en orden. Varias fuentes pueden ir a la misma:
 * nombre, ficha de habitación y ficha del tour son del mismo producto, y su
 * sección es el producto (todas usan su id). El nombre del catálogo es del
 * rubro (`nombreCatalogo` en negocio/<rubro>/datos.js), no de un if.
 */
const CONTENIDO = {
  catalogo: (datos) => datos.nombreCatalogo,
  categorias: () => "Categorías",
  extras: () => "Extras",
  planes: () => "Planes de tarifa",
  temporadas: () => "Temporadas",
  config: () => "Políticas de reserva",
  diseno: () => "Página de inicio"
};
const ORDEN_CONTENIDO = Object.keys(CONTENIDO);

/** `lugares` de una fuente de contenido: su entrada, y la fila como sección. */
function lugaresDeContenido(fuente) {
  if (!CONTENIDO[fuente.lugar]) throw new Error(`FUENTES: lugar de contenido desconocido "${fuente.lugar}"`);
  return (fila, _campo, datos) => [{
    lugar: { id: `contenido/${fuente.lugar}`, zona: "contenido", nombre: CONTENIDO[fuente.lugar](datos), orden: ORDEN_CONTENIDO.indexOf(fuente.lugar) },
    seccion: { id: String(fuente.almacen.idDe(fila)), nombre: fuente.nombre(fila) ?? "" }
  }];
}

/** Completa el registro: la fuente que declara `lugar` recibe sus `lugares`. */
const conLugares = (fuentes) => Object.fromEntries(Object.entries(fuentes)
  .map(([nombre, f]) => [nombre, Object.freeze(f.lugares ? f : { ...f, lugares: lugaresDeContenido(f) })]));

// ── Registro ───────────────────────────────────────────────────────────

const activosDe = (tiendaId) => ({ tiendaId, activo: true });
const deLaTienda = (tiendaId) => ({ tiendaId });

export const FUENTES = Object.freeze(conLugares({
  productos: fuenteCampos({
    etiqueta: "Nombre y descripción", lugar: "catalogo", tabla: "productos", campos: ["nombre", "descripcionCorta", "descripcion"], where: activosDe
  }),
  tours: {
    etiqueta: "Ficha del tour",
    lugar: "catalogo",
    almacen: almacenColumna({
      tabla: "productos",
      where: (tiendaId) => ({ ...activosDe(tiendaId), tour: { isNot: null } }),
      select: {
        nombre: true,
        tour: {
          select: {
            duracion: true, incluye: true, noIncluye: true, queLlevar: true, requisitos: true, puntoEncuentro: true, recojo: true, itinerario: true,
            tiposPasajero: { where: { activo: true }, select: { id: true, nombre: true }, orderBy: { orden: "asc" } }
          }
        }
      }
    }),
    nombre: (f) => f.nombre,
    nombreCampo: nombreCampoTour,
    textos: (f) => textosTour(f.tour),
    // La fila es el producto: { tour, traducciones }.
    aplicar: (fila, tr) => ({ ...fila, tour: aplicarTour(fila.tour, tr) })
  },
  categorias: fuenteCampos({ etiqueta: "Categoría", lugar: "categorias", tabla: "categorias", campos: ["nombre", "descripcion"], where: activosDe }),
  habitaciones: fuenteCampos({
    etiqueta: "Ficha de habitación", lugar: "catalogo", tabla: "hotel_tipos_habitacion", pk: "productoId", campos: ["camas", "amenities"],
    where: deLaTienda, incluir: { producto: { select: { nombre: true } } }, nombre: (f) => f.producto?.nombre
  }),
  extras: fuenteCampos({ etiqueta: "Extra", lugar: "extras", tabla: "hotel_extras", campos: ["nombre", "descripcion", "datoPedido"], where: deLaTienda }),
  temporadas: fuenteCampos({ etiqueta: "Temporada", lugar: "temporadas", tabla: "hotel_temporadas", campos: ["nombre"], where: deLaTienda }),
  planes: fuenteCampos({ etiqueta: "Plan de tarifa", lugar: "planes", tabla: "hotel_planes", campos: ["nombre", "descripcion"], where: deLaTienda }),
  config: fuenteCampos({
    etiqueta: "Configuración de reservas", lugar: "config", tabla: "config_reservas", pk: "tiendaId",
    campos: ["instrucciones", "politicaCancelacion"], where: deLaTienda, nombre: () => "Reservas"
  }),
  diseno: {
    etiqueta: "Página de inicio",
    lugar: "diseno",
    almacen: almacenDiseno(),
    nombre: (f) => f.nombre,
    nombreCampo: nombreCampoDiseno,
    textos: (f) => textosDiseno(f.estructura, f.descripcion),
    // La fila es { estructura, descripcion, traducciones }.
    aplicar: (fila, tr) => ({ ...fila, estructura: aplicarDiseno(fila.estructura, tr), descripcion: textoLocal(fila.descripcion, tr["tienda.descripcion"]) })
  },
  // Botones, títulos y mensajes fijos (docs/specs/idiomas D7). La tienda los
  // recibe ya armados en GET /store/textos (idiomas/textos.service.js).
  textos: {
    etiqueta: "Textos fijos",
    almacen: almacenTextosFijos(),
    nombre: (f) => f.nombre,
    // Lo que va después de "|" aclara dónde se usa ("Salida|tour" → "Texto fijo (tour)").
    nombreCampo: (clave) => (clave.includes("|") ? `Texto fijo (${clave.split("|")[1]})` : "Texto fijo"),
    textos: (f) => Object.fromEntries(f.claves.map((c) => [c, textoBase(c)])),
    // La fila es un grupo: { claves, traducciones } → { clave: texto en el idioma }.
    aplicar: (fila, tr) => ({ ...fila, textos: Object.fromEntries(fila.claves.map((c) => [c, textoLocal(textoBase(c), tr[c])])) }),
    // La pantalla y sección de la tienda (o el correo) donde sale; la fila es su grupo.
    lugares: (fila, clave, datos) => ubicaciones().lugaresDeClave(clave, { gruposTextos: datos.gruposTextos, grupo: fila.id })
  }
}));

export const NOMBRES_FUENTES = Object.freeze(Object.keys(FUENTES));
