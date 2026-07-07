// Precarga las plantillas de métodos de envío en las tiendas EXISTENTES.
//
// Solo agrega las plantillas que a cada tienda le falten (compara por nombre,
// sin distinguir mayúsculas) y NUNCA toca los métodos ya creados por el dueño.
// "Recojo en tienda" se inserta ACTIVADO (no depende de coordinar con un
// courier externo); los couriers/delivery propio se insertan desactivados
// para no alterar el checkout de tiendas que ya están operando.
//
// Uso: node scripts/backfill-metodos-envio.mjs
//      node scripts/backfill-metodos-envio.mjs --dry-run   (solo muestra, no inserta)

import { prisma } from "../config/prisma.js";
import { seedMetodosEnvioParaTienda, METODOS_ENVIO_PLANTILLAS } from "../services/metodos-envio-seed.service.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const tiendas = await prisma.tiendas.findMany({
    select: { id: true, nombre: true },
    orderBy: { fechaRegistro: "asc" }
  });

  console.log(`${tiendas.length} tienda(s) encontradas. Plantillas: ${METODOS_ENVIO_PLANTILLAS.map((p) => p.nombre).join(", ")}\n`);

  let totalCreados = 0;
  for (const tienda of tiendas) {
    if (dryRun) {
      const existentes = await prisma.metodos_envio.findMany({
        where: { tiendaId: tienda.id },
        select: { nombre: true }
      });
      const nombres = new Set(existentes.map((m) => m.nombre.trim().toLowerCase()));
      const faltantes = METODOS_ENVIO_PLANTILLAS.filter((p) => !nombres.has(p.nombre.toLowerCase()));
      console.log(`[dry-run] ${tienda.nombre}: agregaría ${faltantes.length} → ${faltantes.map((p) => p.nombre).join(", ") || "(nada)"}`);
      totalCreados += faltantes.length;
      continue;
    }

    const creados = await seedMetodosEnvioParaTienda(tienda.id, { forzarInactivos: true });
    console.log(`${tienda.nombre}: ${creados} método(s) agregado(s)`);
    totalCreados += creados;
  }

  console.log(`\n${dryRun ? "[dry-run] Se agregarían" : "Listo:"} ${totalCreados} método(s) en total.`);
}

main()
  .catch((err) => {
    console.error("Error en el backfill:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
