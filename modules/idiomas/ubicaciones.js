import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ETIQUETA_GRUPO } from "./grupos.js";

/**
 * Dónde ve el dueño cada texto fijo en Traducciones (docs/specs/idiomas,
 * diseno.md A3, A7). Es metadato del código: sale de los JSON que generan los
 * extractores (claves/*.json → `ubicaciones` de cada clave; pantallas/*.json →
 * nombres, zona y grupos de cada sección) y se lee una vez, sin tabla. Solo
 * sirve para mostrar: qué claves le tocan a la tienda y cuándo se publica un
 * idioma sigue saliendo de los grupos (textos_claves).
 *
 * Un lugar tiene la forma que usan todas las fuentes (fuentes.js):
 *   { lugar: { id, zona, nombre, orden }, seccion: { id, nombre, orden? } }
 */

const RAIZ = dirname(fileURLToPath(import.meta.url));
/** Zona de las pantallas que no la declaran: las de la tienda. */
const ZONA_PANTALLAS = "pantallas";

/** Donde cae una clave sin ubicación visible para el rubro: ningún texto queda fuera. */
const lugarDeRespaldo = (grupo) => ({
  lugar: { id: `${ZONA_PANTALLAS}/otros`, zona: ZONA_PANTALLAS, nombre: "Otros textos", orden: Number.MAX_SAFE_INTEGER },
  seccion: { id: grupo, nombre: ETIQUETA_GRUPO[grupo] ?? grupo }
});

/**
 * Specification por capacidad: una ubicación se muestra si su sección tiene
 * algún grupo que el rubro muestra (`gruposTextos`). Nunca pregunta por el rubro.
 */
export const ubicacionVisible = (seccion, gruposTextos) => seccion.grupos.some((g) => gruposTextos.includes(g));

/**
 * Índice de lugares a partir de los catálogos ya leídos. Función pura.
 * @param {{ claves: { clave: string, ubicaciones?: string[] }[], pantallas: { id, nombre, zona?, secciones: { id, nombre, grupos: string[] }[] }[] }} catalogos
 */
export function crearUbicaciones({ claves, pantallas }) {
  const secciones = new Map();   // "pantalla/seccion" → { lugar, seccion, grupos }
  pantallas.forEach((p, orden) => {
    const zona = p.zona ?? ZONA_PANTALLAS;
    const lugar = { id: `${zona}/${p.id}`, zona, nombre: p.nombre, orden };
    p.secciones.forEach((s, ordenSeccion) => {
      const ubicacion = `${p.id}/${s.id}`;
      if (secciones.has(ubicacion)) throw new Error(`Pantallas de Traducciones: "${ubicacion}" está dos veces`);
      secciones.set(ubicacion, { lugar, seccion: { id: s.id, nombre: s.nombre, orden: ordenSeccion }, grupos: s.grupos });
    });
  });
  const porClave = new Map();
  for (const { clave, ubicaciones = [] } of claves) {
    porClave.set(clave, [...new Set([...(porClave.get(clave) ?? []), ...ubicaciones])]);
  }

  return {
    /** Lugares de una clave para un rubro; si ninguno se ve, el de su grupo. */
    lugaresDeClave(clave, { gruposTextos, grupo }) {
      const lugares = (porClave.get(clave) ?? [])
        .map((u) => secciones.get(u))
        .filter((s) => s && ubicacionVisible(s, gruposTextos))
        .map(({ lugar, seccion }) => ({ lugar, seccion }));
      return lugares.length ? lugares : [lugarDeRespaldo(grupo)];
    }
  };
}

/**
 * Catálogos de pantallas, en el orden en que se muestran: la tienda (el
 * recorrido del cliente) y después los mensajes del servidor. Un test exige
 * que la carpeta no tenga otros.
 */
export const ARCHIVOS_PANTALLAS = Object.freeze(["pantallas-tienda.json", "pantallas-servidor.json"]);

const leerJson = (...ruta) => JSON.parse(readFileSync(join(RAIZ, ...ruta), "utf8"));

let indice = null;

/** El índice de lo desplegado (se lee una vez: viene con el código). */
export function ubicaciones() {
  if (!indice) {
    const claves = readdirSync(join(RAIZ, "claves")).filter((a) => a.endsWith(".json")).sort().flatMap((a) => leerJson("claves", a));
    indice = crearUbicaciones({ claves, pantallas: ARCHIVOS_PANTALLAS.flatMap((a) => leerJson("pantallas", a)) });
  }
  return indice;
}
