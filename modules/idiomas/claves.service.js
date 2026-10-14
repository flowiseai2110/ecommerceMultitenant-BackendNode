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
 * `node scripts/cargar-claves.mjs`): crea las nuevas, actualiza el grupo de las que
 * cambiaron y marca obsoletas las que ya no están (no las borra: la tienda
 * puede tener su traducción y la clave podría volver).
 */

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "claves");

/** Las claves de todos los JSON de la carpeta, validadas. @returns {{ clave: string, grupo: string }[]} */
export function leerCatalogo(carpeta = CARPETA) {
  const porClave = new Map();
  for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith(".json")).sort()) {
    for (const { clave, grupo } of JSON.parse(readFileSync(join(carpeta, archivo), "utf8"))) {
      if (typeof clave !== "string" || !clave.trim()) throw new Error(`${archivo}: clave vacía`);
      if (!GRUPOS_TEXTOS.includes(grupo)) throw new Error(`${archivo}: grupo desconocido "${grupo}" en "${clave}"`);
      const previo = porClave.get(clave);
      // La misma clave en la tienda y en el servidor: vale para toda tienda.
      porClave.set(clave, previo && previo !== grupo ? "comun" : grupo);
    }
  }
  return [...porClave.entries()].map(([clave, grupo]) => ({ clave, grupo }));
}

/**
 * Qué hacer para que la tabla refleje el catálogo. Función pura.
 * @param {{ clave: string, grupo: string, obsoleta: boolean }[]} existentes
 * @param {{ clave: string, grupo: string }[]} catalogo
 */
export function planDeCarga(existentes, catalogo) {
  const actuales = new Map(existentes.map((e) => [e.clave, e]));
  const enCatalogo = new Set(catalogo.map((c) => c.clave));
  return {
    crear: catalogo.filter((c) => !actuales.has(c.clave)),
    actualizar: catalogo.filter((c) => {
      const e = actuales.get(c.clave);
      return e && (e.grupo !== c.grupo || e.obsoleta);
    }),
    obsoletas: existentes.filter((e) => !e.obsoleta && !enCatalogo.has(e.clave)).map((e) => e.clave)
  };
}

/** Lleva el catálogo a la BD. Con `simular`, solo devuelve el plan. */
export async function cargarClaves({ catalogo = leerCatalogo(), usuario = "cargar-claves", simular = false } = {}) {
  const existentes = await prisma.textos_claves.findMany({ select: { clave: true, grupo: true, obsoleta: true } });
  const plan = planDeCarga(existentes, catalogo);
  if (simular || (!plan.crear.length && !plan.actualizar.length && !plan.obsoletas.length)) return plan;
  const ahora = new Date();
  // En bloque, no fila por fila: con la BD remota, cientos de UPDATE pasan el
  // tope de 5 s de la transacción. Las que cambian de grupo, un UPDATE por grupo.
  const porGrupo = new Map();
  for (const c of plan.actualizar) porGrupo.set(c.grupo, [...(porGrupo.get(c.grupo) ?? []), c.clave]);
  await prisma.$transaction([
    prisma.textos_claves.createMany({ data: plan.crear.map((c) => ({ ...c, usuarioRegistro: usuario })), skipDuplicates: true }),
    ...[...porGrupo].map(([grupo, claves]) => prisma.textos_claves.updateMany({
      where: { clave: { in: claves } }, data: { grupo, obsoleta: false, fechaActualizacion: ahora, usuarioActualizacion: usuario }
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
