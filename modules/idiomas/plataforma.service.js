import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/prisma.js";
import { CODIGO_IDIOMA } from "./idioma.js";

/**
 * Traducciones de textos fijos que ofrece la plataforma (docs/specs/idiomas D7).
 *
 * Viven en el repo, un archivo por idioma: `modules/idiomas/plataforma/<codigo>.json`
 * ({ clave: texto }), versionadas con el código que las usa. Hoy `en.json` (el
 * inglés que antes estaba en textos.en.ts de la tienda); agregar portugués es
 * sumar `pt.json` y dar de alta `pt` en la pantalla Idiomas. El backend las
 * lleva a `textos_plataforma` al arrancar. El archivo manda: lo que se quita
 * de él se quita de la tabla. La tienda puede reemplazar cualquiera.
 */

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "plataforma");

/** { codigo: { clave: texto } } de los archivos de la carpeta. */
export function leerTextosPlataforma(carpeta = CARPETA) {
  if (!existsSync(carpeta)) return {};
  const porIdioma = {};
  for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith(".json"))) {
    const codigo = archivo.replace(/\.json$/, "");
    if (!CODIGO_IDIOMA.test(codigo)) throw new Error(`plataforma/${archivo}: el nombre debe ser un código de idioma`);
    porIdioma[codigo] = JSON.parse(readFileSync(join(carpeta, archivo), "utf8"));
  }
  return porIdioma;
}

/**
 * Qué escribir para que la tabla refleje los archivos. Función pura.
 * Se omiten los idiomas que no existen en `idiomas` y las claves que no están
 * en `textos_claves` (p. ej. las del servidor antes de tener su catálogo).
 */
export function planTextosPlataforma({ existentes, deseados, idiomas, claves }) {
  const actual = new Map(existentes.map((e) => [`${e.idioma}|${e.clave}`, e.texto]));
  const guardar = [];
  const omitidas = [];
  const borrar = [];
  for (const [idioma, textos] of Object.entries(deseados)) {
    if (!idiomas.has(idioma)) { omitidas.push(...Object.keys(textos).map((clave) => ({ idioma, clave, motivo: "idioma" }))); continue; }
    for (const [clave, texto] of Object.entries(textos)) {
      if (!claves.has(clave)) { omitidas.push({ idioma, clave, motivo: "clave" }); continue; }
      if (actual.get(`${idioma}|${clave}`) !== texto) guardar.push({ idioma, clave, texto });
    }
    for (const e of existentes) if (e.idioma === idioma && !(e.clave in textos)) borrar.push({ idioma, clave: e.clave });
  }
  return { guardar, borrar, omitidas };
}

/** Lleva los archivos a `textos_plataforma`. */
export async function cargarTextosPlataforma({ deseados = leerTextosPlataforma(), usuario = "textos-plataforma", simular = false } = {}) {
  const [existentes, idiomas, claves] = await Promise.all([
    prisma.textos_plataforma.findMany({ select: { idioma: true, clave: true, texto: true } }),
    prisma.idiomas.findMany({ select: { codigo: true } }),
    prisma.textos_claves.findMany({ select: { clave: true } })
  ]);
  const plan = planTextosPlataforma({
    existentes, deseados, idiomas: new Set(idiomas.map((i) => i.codigo)), claves: new Set(claves.map((c) => c.clave))
  });
  if (simular || (!plan.guardar.length && !plan.borrar.length)) return plan;
  // En bloque por idioma (borrar lo que cambia o sale y volver a crear): con la
  // BD remota, mil UPSERT pasan el tope de 5 s de la transacción.
  const idiomasTocados = [...new Set([...plan.guardar, ...plan.borrar].map((x) => x.idioma))];
  await prisma.$transaction([
    ...idiomasTocados.map((idioma) => prisma.textos_plataforma.deleteMany({
      where: { idioma, clave: { in: [...plan.guardar, ...plan.borrar].filter((x) => x.idioma === idioma).map((x) => x.clave) } }
    })),
    prisma.textos_plataforma.createMany({ data: plan.guardar.map((x) => ({ ...x, usuarioRegistro: usuario })) })
  ]);
  return plan;
}
