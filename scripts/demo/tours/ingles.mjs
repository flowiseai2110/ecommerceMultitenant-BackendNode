// Agencia demo en inglés (hospedaje-completo C3/C4/C6 extendido a tours):
// activa el inglés en tour-test, el precio de referencia en dólares y dos
// reseñas de otros sitios, y corre la traducción automática de sus tours.
// Las reseñas son valores de ejemplo para la demo.
//
// Uso (desde la raíz del backend): node scripts/demo/tours/ingles.mjs [--tienda slug]

import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../../../config/prisma.js";
import { traducirPendientes } from "../../../modules/traducciones/traducciones.service.js";

const { values } = parseArgs({ options: { tienda: { type: "string", default: "tour-test" } } });

const RESENAS = [
  { fuente: "tripadvisor", puntaje: 4.9, cantidad: 640, url: "https://www.tripadvisor.com/Search?q=Cusco%20tours" },
  { fuente: "getyourguide", puntaje: 4.8, cantidad: 1210, url: "https://www.getyourguide.com/cusco-l359/" }
];

const tienda = await prisma.tiendas.findFirst({ where: { slug: values.tienda }, select: { id: true } });
if (!tienda) throw new Error(`No existe la tienda ${values.tienda}`);

await prisma.tiendas.update({ where: { id: tienda.id }, data: { idiomas: ["es", "en"] } });
await prisma.config_reservas.upsert({
  where: { tiendaId: tienda.id },
  update: { tipoCambioUsd: 3.75, resenasExternas: RESENAS },
  create: { tiendaId: tienda.id, tipoCambioUsd: 3.75, resenasExternas: RESENAS, usuarioRegistro: "demo-tours-ingles" }
});

const traducidos = await traducirPendientes(tienda.id);
console.log(`${values.tienda}: inglés activo, ${traducidos} textos traducidos`);
await prisma.$disconnect();
