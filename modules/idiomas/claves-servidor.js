import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { idDeNombre, porPrefijo, prefijoDe } from "./prefijos.js";

/**
 * Claves de los textos fijos del servidor (docs/specs/idiomas D8): las marcadas
 * con `clave("…")` en modules/. Las escribe `scripts/claves-servidor.mjs` en
 * `claves/claves-servidor.json` (con sus ubicaciones) y
 * `pantallas/pantallas-servidor.json`; un test falla si no están al día.
 *
 * Grupos y ubicación salen del archivo con la misma regla (prefijos.js). Una
 * clave lleva todos los grupos de los archivos donde se usa, sin subirla a uno
 * general: una tienda traduce solo lo que muestra. Cada
 * texto se identifica por su archivo y la declaración de primer nivel que lo
 * contiene ("reservas/reservas.emails.js#confirmadaEmail"): así cada correo es
 * su propia sección en Traducciones.
 */

const MODULOS = join(dirname(fileURLToPath(import.meta.url)), "..");

const GRUPO_POR_RUTA = {
  "reservas": "reservas",
  "reservas/hotel": "hotel",
  "reservas/tours": "tours",
  "reservas/eventos": "eventos",
  "reservas/locales": "locales",
  "reservas/canchas": "canchas",
  "reservas/reservas.emails.js": "correos",
  "ordenes": "productos",
  "pagos": "comun"
};

const CORREOS = "reservas/reservas.emails.js";

/**
 * Dónde ve el dueño los textos del servidor en Traducciones (diseno.md A6):
 * pantalla → sección → prefijos, en la zona "mensajes" (no son una pantalla de
 * la tienda). Contrato 10: todo texto tiene sección aquí y todo prefijo tiene
 * textos. Lo de las funciones auxiliares de los correos (marco, resumen, voz)
 * va a "Partes comunes": sale en todos.
 */
export const PANTALLAS_SERVIDOR = {
  correos: { nombre: "Correos al cliente", zona: "mensajes", secciones: {
    "Solicitud recibida": [`${CORREOS}#solicitudRecibidaEmail`],
    "Compra por pagar": [`${CORREOS}#compraPendienteEmail`],
    "Reserva aceptada": [`${CORREOS}#aceptadaEmail`],
    "Reserva rechazada": [`${CORREOS}#rechazadaEmail`],
    "Reserva confirmada": [`${CORREOS}#confirmadaEmail`],
    "Partes comunes de los correos": [
      `${CORREOS}#fechaHora`, `${CORREOS}#DIAS_CORTOS`, `${CORREOS}#VOZ`, `${CORREOS}#VOZ_ALOJAMIENTO`,
      `${CORREOS}#VOZ_HOTEL`, `${CORREOS}#textoPersonas`, `${CORREOS}#estadia`, `${CORREOS}#resumen`
    ]
  } },
  sistema: { nombre: "Mensajes del sistema", zona: "mensajes", secciones: {
    "Disponibilidad y precios": ["reservas/hotel/textos-cotizar.js", "reservas/hotel/habitaciones.service.js", "reservas/reservas.serializer.js"],
    "Salidas de los tours": ["reservas/tours/textos-tour.js"],
    "Estados de la reserva": ["reservas/estados.js"],
    "Fechas": ["reservas/textos-fecha.js"],
    "Pedidos": ["ordenes"],
    "Pago en línea": ["pagos"]
  } }
};

function* archivos(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") yield* archivos(ruta); }
    else if (e.name.endsWith(".js")) yield ruta;
  }
}

function grupoDe(rel) {
  const grupo = porPrefijo(GRUPO_POR_RUTA, rel);
  if (!grupo) throw new Error(`${rel}: tiene textos marcados con clave() pero su carpeta no tiene grupo (GRUPO_POR_RUTA)`);
  return grupo;
}

/** Declaraciones de primer nivel de un archivo: [{ nombre, desde }] en orden. */
function declaraciones(texto) {
  return [...texto.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => ({ nombre: m[1], desde: m.index }));
}

/** "archivo#declaración" donde está la posición `pos` (o el archivo, si va antes de toda declaración). */
function componenteEn(rel, decls, pos) {
  const d = decls.filter((x) => x.desde <= pos).at(-1);
  return d ? `${rel}#${d.nombre}` : rel;
}

/**
 * Ubicaciones de cada clave y catálogo de pantallas, con el mismo formato que
 * el de la tienda. `sinUbicacion` y `sinUso` deben quedar vacíos (contrato 10).
 */
export function ubicarServidor(claves, pantallas = PANTALLAS_SERVIDOR) {
  const porPrefijoDe = {};
  const orden = new Map();
  for (const [pantalla, { secciones }] of Object.entries(pantallas)) {
    for (const [nombre, prefijos] of Object.entries(secciones)) {
      const ubicacion = `${pantalla}/${idDeNombre(nombre)}`;
      if (!orden.has(ubicacion)) orden.set(ubicacion, orden.size);
      for (const p of prefijos) {
        if (porPrefijoDe[p]) throw new Error(`PANTALLAS_SERVIDOR: "${p}" está en ${porPrefijoDe[p]} y en ${ubicacion}`);
        porPrefijoDe[p] = ubicacion;
      }
    }
  }
  const sinUbicacion = new Set();
  const usados = new Set();
  const gruposPorUbicacion = new Map();
  const conUbicaciones = claves.map(({ clave, grupos, componentes }) => {
    const ubicaciones = new Set();
    for (const componente of componentes) {
      const prefijo = prefijoDe(porPrefijoDe, componente);
      if (prefijo === undefined) { sinUbicacion.add(componente); continue; }
      const ubicacion = porPrefijoDe[prefijo];
      usados.add(prefijo);
      ubicaciones.add(ubicacion);
      if (!gruposPorUbicacion.has(ubicacion)) gruposPorUbicacion.set(ubicacion, new Set());
      gruposPorUbicacion.get(ubicacion).add(grupoDe(componente.split("#")[0]));
    }
    return { clave, grupos, ubicaciones: [...ubicaciones].sort((a, b) => orden.get(a) - orden.get(b)) };
  });
  const catalogo = Object.entries(pantallas).map(([id, { nombre, zona, secciones }]) => ({
    id,
    nombre,
    zona,
    secciones: Object.keys(secciones)
      .map((s) => ({ id: idDeNombre(s), nombre: s, grupos: gruposPorUbicacion.get(`${id}/${idDeNombre(s)}`) }))
      .filter((s) => s.grupos)
      .map(({ id: sid, nombre: snombre, grupos }) => ({ id: sid, nombre: snombre, grupos: [...grupos].sort() }))
  })).filter((p) => p.secciones.length);
  return {
    claves: conUbicaciones,
    pantallas: catalogo,
    sinUbicacion: [...sinUbicacion].sort(),
    sinUso: Object.keys(porPrefijoDe).filter((p) => !usados.has(p)).sort()
  };
}

/** Las claves del servidor con el componente donde se usa cada una (sin ubicar). */
function extraer(modulos) {
  const usos = new Map();
  for (const ruta of archivos(modulos)) {
    const rel = relative(modulos, ruta).split(sep).join("/");
    if (rel.startsWith("idiomas/")) continue; // la propia maquinaria
    const texto = readFileSync(ruta, "utf8");
    const decls = declaraciones(texto);
    for (const m of texto.matchAll(/\bclave\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
      const clave = JSON.parse(`"${m[1]}"`);
      if (!usos.has(clave)) usos.set(clave, { grupos: new Set(), componentes: new Set() });
      usos.get(clave).grupos.add(grupoDe(rel));
      usos.get(clave).componentes.add(componenteEn(rel, decls, m.index));
    }
  }
  return [...usos.entries()]
    .map(([clave, { grupos, componentes }]) => ({ clave, grupos: [...grupos].sort(), componentes }))
    .sort((a, b) => a.clave.localeCompare(b.clave, "es"));
}

/**
 * Catálogo del servidor: `claves` ({ clave, grupos, ubicaciones }, ordenadas
 * como el JSON) y `pantallas`, más lo que viola el contrato 10.
 */
export function extraerClavesServidor(modulos = MODULOS) {
  return ubicarServidor(extraer(modulos));
}
