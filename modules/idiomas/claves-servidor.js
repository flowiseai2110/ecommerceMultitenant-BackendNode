import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Claves de los textos fijos del servidor (docs/specs/idiomas D8): las marcadas
 * con `clave("…")` en modules/. Las escribe `scripts/claves-servidor.mjs` en
 * `claves/claves-servidor.json`; un test falla si ese JSON no está al día.
 *
 * Grupo según el archivo (gana el prefijo más largo).
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

function* archivos(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") yield* archivos(ruta); }
    else if (e.name.endsWith(".js")) yield ruta;
  }
}

function grupoDe(rel) {
  const prefijo = Object.keys(GRUPO_POR_RUTA).filter((p) => rel === p || rel.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  if (!prefijo) throw new Error(`${rel}: tiene textos marcados con clave() pero su carpeta no tiene grupo (GRUPO_POR_RUTA)`);
  return GRUPO_POR_RUTA[prefijo];
}

/** @returns {{ clave: string, grupo: string }[]} ordenadas como el JSON */
export function extraerClavesServidor(modulos = MODULOS) {
  const usos = new Map();
  for (const ruta of archivos(modulos)) {
    const rel = relative(modulos, ruta).split(sep).join("/");
    if (rel.startsWith("idiomas/")) continue; // la propia maquinaria
    const texto = readFileSync(ruta, "utf8");
    for (const m of texto.matchAll(/\bclave\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
      const clave = JSON.parse(`"${m[1]}"`);
      if (!usos.has(clave)) usos.set(clave, new Set());
      usos.get(clave).add(grupoDe(rel));
    }
  }
  return [...usos.entries()]
    .map(([clave, grupos]) => ({ clave, grupo: grupos.size === 1 ? [...grupos][0] : "comun" }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.clave.localeCompare(b.clave, "es"));
}
