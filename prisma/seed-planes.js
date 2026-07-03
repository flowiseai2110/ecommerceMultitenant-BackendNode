import { prisma } from "../config/prisma.js";

// Placeholders sin precio definido todavía — ajustar precioMensual y
// precioImagenExcedente cuando se decida la tabla de precios.
const planes = [
  { codigo: "free", nombre: "Free", limiteImagenesIaMes: 5, orden: 1 },
  { codigo: "starter", nombre: "Starter", limiteImagenesIaMes: 50, orden: 2 },
  { codigo: "pro", nombre: "Pro", limiteImagenesIaMes: 300, orden: 3 },
  { codigo: "business", nombre: "Business", limiteImagenesIaMes: null, orden: 4 }
];

for (const plan of planes) {
  await prisma.planes.upsert({
    where: { codigo: plan.codigo },
    update: plan,
    create: plan
  });
  console.log(`Plan "${plan.codigo}" listo`);
}

await prisma.$disconnect();
