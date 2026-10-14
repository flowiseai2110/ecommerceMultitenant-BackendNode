// Lleva el catálogo de textos fijos a `textos_claves` y las traducciones de la
// plataforma (modules/idiomas/plataforma/*.json) a `textos_plataforma`
// (docs/specs/idiomas D8, tasks.md 1.5).
//
// El catálogo está en modules/idiomas/claves/*.json. claves-tienda.json lo
// genera `npm run claves` en FrontendStore (y lo copia aquí). El backend hace
// esto solo al arrancar (sincronizarClavesAlIniciar); el script sirve para
// verlo con --simular o para forzarlo sin reiniciar.
//
// Crea las claves nuevas, actualiza el grupo de las que cambiaron y marca
// obsoletas las que ya no están (no las borra). Se puede correr varias veces.
//
// Uso (desde la raíz del backend):
//   node scripts/cargar-claves.mjs --simular   (solo muestra qué haría)
//   node scripts/cargar-claves.mjs

import { prisma } from "../config/prisma.js";
import { cargarClaves } from "../modules/idiomas/claves.service.js";
import { cargarTextosPlataforma } from "../modules/idiomas/plataforma.service.js";

const simular = process.argv.includes("--simular");

try {
  const plan = await cargarClaves({ simular });
  const muestra = (l) => l.slice(0, 5).map((c) => `    ${typeof c === "string" ? c : `${c.clave} (${c.grupo})`}`).join("\n");
  console.log(`${simular ? "SIMULACIÓN — no se escribió nada" : "Listo"}:`);
  console.log(`  nuevas: ${plan.crear.length}\n${muestra(plan.crear)}`);
  console.log(`  grupo cambiado o reactivadas: ${plan.actualizar.length}\n${muestra(plan.actualizar)}`);
  console.log(`  obsoletas: ${plan.obsoletas.length}\n${muestra(plan.obsoletas)}`);
  // Las traducciones de la plataforma van después: necesitan sus claves.
  const pl = await cargarTextosPlataforma({ simular });
  console.log(`  traducciones de la plataforma a guardar: ${pl.guardar.length}, a quitar: ${pl.borrar.length}`);
  console.log(`  omitidas (su clave o su idioma todavía no existe): ${pl.omitidas.length}\n${muestra(pl.omitidas.map((o) => `${o.idioma}: ${o.clave}`))}`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
