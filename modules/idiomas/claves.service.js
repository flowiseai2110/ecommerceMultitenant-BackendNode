import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { GRUPOS_TEXTOS } from "./grupos.js";
import { cargarTextosPlataforma } from "./plataforma.service.js";
import { invalidarTextos } from "./textos.service.js";

/**
 * Catálogo de textos fijos (docs/specs/idiomas D8, diseno.md B8).
 *
 * Las claves salen del código: `modules/idiomas/claves/*.json`. Hoy
 * `claves-tienda.json` (lo genera `npm run claves` en FrontendStore); las del
 * servidor (correos, estados) se suman en tasks.md 1.7. `cargarClaves` las
 * lleva a `textos_claves` (el backend lo hace solo al arrancar; también
 * `node scripts/cargar-claves.mjs`): crea las nuevas, actualiza los grupos de las que
 * cambiaron y marca obsoletas las que ya no están (no las borra: la tienda
 * puede tener su traducción y la clave podría volver). Una clave lleva todos
 * los grupos donde se usa (tienda y servidor juntos).
 */

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "claves");

/** Los grupos en el orden de GRUPOS_TEXTOS: una lista se compara con otra sin importar de dónde vino. */
export const ordenarGrupos = (grupos) => [...new Set(grupos)].sort((a, b) => GRUPOS_TEXTOS.indexOf(a) - GRUPOS_TEXTOS.indexOf(b));

/** Las claves de todos los JSON de la carpeta, validadas. @returns {{ clave: string, grupos: string[] }[]} */
export function leerCatalogo(carpeta = CARPETA) {
  const porClave = new Map();
  for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith(".json")).sort()) {
    for (const { clave, grupos } of JSON.parse(readFileSync(join(carpeta, archivo), "utf8"))) {
      if (typeof clave !== "string" || !clave.trim()) throw new Error(`${archivo}: clave vacía`);
      if (!Array.isArray(grupos) || !grupos.length) throw new Error(`${archivo}: "${clave}" sin grupos`);
      const desconocido = grupos.find((g) => !GRUPOS_TEXTOS.includes(g));
      if (desconocido) throw new Error(`${archivo}: grupo desconocido "${desconocido}" en "${clave}"`);
      // La misma clave en la tienda y en el servidor: los grupos de los dos.
      porClave.set(clave, [...(porClave.get(clave) ?? []), ...grupos]);
    }
  }
  return [...porClave.entries()].map(([clave, grupos]) => ({ clave, grupos: ordenarGrupos(grupos) }));
}

const mismosGrupos = (a, b) => a.length === b.length && a.every((g, i) => g === b[i]);

/**
 * Qué hacer para que la tabla refleje el catálogo. Función pura.
 * @param {{ clave: string, grupos: string[], obsoleta: boolean }[]} existentes
 * @param {{ clave: string, grupos: string[] }[]} catalogo
 */
export function planDeCarga(existentes, catalogo) {
  const actuales = new Map(existentes.map((e) => [e.clave, e]));
  const enCatalogo = new Set(catalogo.map((c) => c.clave));
  return {
    crear: catalogo.filter((c) => !actuales.has(c.clave)),
    actualizar: catalogo.filter((c) => {
      const e = actuales.get(c.clave);
      return e && (!mismosGrupos(ordenarGrupos(e.grupos), c.grupos) || e.obsoleta);
    }),
    obsoletas: existentes.filter((e) => !e.obsoleta && !enCatalogo.has(e.clave)).map((e) => e.clave)
  };
}

/** Lleva el catálogo a la BD. Con `simular`, solo devuelve el plan. */
export async function cargarClaves({ catalogo = leerCatalogo(), usuario = "cargar-claves", simular = false } = {}) {
  const existentes = await prisma.textos_claves.findMany({ select: { clave: true, grupos: true, obsoleta: true } });
  const plan = planDeCarga(existentes, catalogo);
  if (simular || (!plan.crear.length && !plan.actualizar.length && !plan.obsoletas.length)) return plan;
  const ahora = new Date();
  // En bloque, no fila por fila: con la BD remota, cientos de UPDATE pasan el
  // tope de 5 s de la transacción. Las que cambian de grupos, un UPDATE por cada combinación.
  const porGrupos = new Map();
  for (const c of plan.actualizar) {
    const k = c.grupos.join(",");
    porGrupos.set(k, { grupos: c.grupos, claves: [...(porGrupos.get(k)?.claves ?? []), c.clave] });
  }
  await prisma.$transaction([
    prisma.textos_claves.createMany({ data: plan.crear.map((c) => ({ ...c, usuarioRegistro: usuario })), skipDuplicates: true }),
    ...[...porGrupos.values()].map(({ grupos, claves }) => prisma.textos_claves.updateMany({
      where: { clave: { in: claves } }, data: { grupos, obsoleta: false, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    })),
    prisma.textos_claves.updateMany({
      where: { clave: { in: plan.obsoletas } }, data: { obsoleta: true, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    })
  ]);
  return plan;
}

/**
 * Al arrancar el backend: deja `textos_claves` igual al catálogo del código
 * desplegado y `textos_plataforma` igual a sus archivos (en ese orden: las
 * traducciones necesitan sus claves). Si no hay cambios no escribe; si falla
 * (BD caída, JSON roto) lo deja en el log y el servidor sigue: no bloquea la
 * tienda. Nunca lanza.
 */
export async function sincronizarClavesAlIniciar() {
  try {
    const { crear, actualizar, obsoletas } = await cargarClaves({ usuario: "arranque" });
    const { guardar, borrar } = await cargarTextosPlataforma({ usuario: "arranque" });
    if (crear.length || actualizar.length || obsoletas.length || guardar.length || borrar.length) {
      invalidarTextos();
      logger.info(`🌐 Textos fijos: ${crear.length} claves nuevas, ${actualizar.length} actualizadas, ${obsoletas.length} obsoletas; ` +
        `${guardar.length} traducciones de la plataforma guardadas, ${borrar.length} quitadas`);
    }
  } catch (error) {
    logger.error(`🌐 Textos fijos: no se pudo sincronizar el catálogo: ${error.message}`);
  }
}
