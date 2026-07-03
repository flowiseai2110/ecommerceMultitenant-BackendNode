// Precarga las plantillas de métodos de pago en las tiendas EXISTENTES.
//
// Solo agrega las plantillas que a cada tienda le falten (compara por nombre,
// sin distinguir mayúsculas) y NUNCA toca los métodos ya creados por el dueño.
// Todo se inserta DESACTIVADO — incluso "Pago contra entrega" — para no
// alterar el checkout de tiendas que ya están operando; cada dueño decide
// qué activar desde su mantenimiento de Métodos de Pago.
//
// Uso: node scripts/backfill-metodos-pago.mjs
//      node scripts/backfill-metodos-pago.mjs --dry-run   (solo muestra, no inserta)

import { prisma } from "../config/prisma.js";
import { seedMetodosPagoParaTienda, METODOS_PAGO_PLANTILLAS } from "../services/metodos-pago-seed.service.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const tiendas = await prisma.tiendas.findMany({
    select: { id: true, nombre: true },
    orderBy: { fechaRegistro: "asc" }
  });

  console.log(`${tiendas.length} tienda(s) encontradas. Plantillas: ${METODOS_PAGO_PLANTILLAS.map((p) => p.nombre).join(", ")}\n`);

  let totalCreados = 0;
  for (const tienda of tiendas) {
    if (dryRun) {
      const existentes = await prisma.metodos_pago.findMany({
        where: { tiendaId: tienda.id },
        select: { nombre: true }
      });
      const nombres = new Set(existentes.map((m) => m.nombre.trim().toLowerCase()));
      const faltantes = METODOS_PAGO_PLANTILLAS.filter((p) => !nombres.has(p.nombre.toLowerCase()));
      console.log(`[dry-run] ${tienda.nombre}: agregaría ${faltantes.length} → ${faltantes.map((p) => p.nombre).join(", ") || "(nada)"}`);
      totalCreados += faltantes.length;
      continue;
    }

    const creados = await seedMetodosPagoParaTienda(tienda.id, { forzarInactivos: true });
    console.log(`${tienda.nombre}: ${creados} método(s) agregado(s)`);
    totalCreados += creados;
  }

  console.log(`\n${dryRun ? "[dry-run] Se agregarían" : "Listo:"} ${totalCreados} método(s) en total (todos desactivados).`);
}

main()
  .catch((err) => {
    console.error("Error en el backfill:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
