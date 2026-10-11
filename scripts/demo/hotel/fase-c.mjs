// Datos de demo de hospedaje-completo fase C:
// - killa-hostal: hostal al paso (por horas y por noche). Solo reseñas de
//   Google; sin inglés, sin dólares ni plan no reembolsable. Sus unidades van
//   en killa-hostal.json.
// - mirador-miraflores: hotel turístico con inventario, plan no reembolsable,
//   precio en dólares, reseñas de otros sitios y vitrina en inglés.
// Las reseñas son valores de ejemplo para la demo.
//
// Uso (desde la raíz del backend): node scripts/demo/hotel/fase-c.mjs
// Se puede correr varias veces: el plan no se duplica (mismo nombre).

import "dotenv/config";
import { prisma } from "../../../config/prisma.js";
import { traducirPendientes } from "../../../modules/traducciones/traducciones.service.js";

const DEMOS = {
  "killa-hostal": {
    idiomas: ["es"], tipoCambioUsd: null, unidades: {}, plan: null,
    resenas: [
      { fuente: "google", puntaje: 4.1, cantidad: 186, url: "https://www.google.com/maps/search/Killa+Hostal+Barranco" }
    ]
  },
  "mirador-miraflores": {
    idiomas: ["es", "en"], tipoCambioUsd: 3.75,
    unidades: { "STD-Q": 12, "SUP-T": 8, "SUP-M": 6, "JR-S": 3, "FAM-S": 2 },
    plan: { nombre: "No reembolsable", descripcion: "Pago total al reservar. Sin cambios ni devoluciones.", ajustePct: -12 },
    resenas: [
      { fuente: "booking", puntaje: 8.8, cantidad: 960, url: "https://www.booking.com/searchresults.html?ss=Miraflores%2C+Lima" },
      { fuente: "tripadvisor", puntaje: 4.5, cantidad: 410, url: "https://www.tripadvisor.com/Search?q=Miraflores%20hotel" },
      { fuente: "google", puntaje: 4.6, cantidad: 530, url: "https://www.google.com/maps/search/Hotel+Mirador+Miraflores" }
    ]
  }
};

const USUARIO = "demo-fase-c";

for (const [slug, d] of Object.entries(DEMOS)) {
  const tienda = await prisma.tiendas.findFirst({ where: { slug }, select: { id: true } });
  if (!tienda) { console.log(`${slug}: no existe, se omite`); continue; }

  await prisma.tiendas.update({ where: { id: tienda.id }, data: { idiomas: d.idiomas } });

  const tipos = await prisma.hotel_tipos_habitacion.findMany({
    where: { producto: { tiendaId: tienda.id } }, select: { productoId: true, producto: { select: { sku: true } } }
  });
  for (const t of tipos) {
    const unidades = d.unidades[t.producto.sku];
    if (unidades) await prisma.hotel_tipos_habitacion.update({ where: { productoId: t.productoId }, data: { unidades } });
  }

  await prisma.config_reservas.upsert({
    where: { tiendaId: tienda.id },
    update: { tipoCambioUsd: d.tipoCambioUsd, resenasExternas: d.resenas },
    create: { tiendaId: tienda.id, tipoCambioUsd: d.tipoCambioUsd, resenasExternas: d.resenas, usuarioRegistro: USUARIO }
  });

  const existe = d.plan && await prisma.hotel_planes.findFirst({ where: { tiendaId: tienda.id, nombre: d.plan.nombre } });
  if (d.plan && !existe) await prisma.hotel_planes.create({ data: { tiendaId: tienda.id, ...d.plan, reembolsable: false, usuarioRegistro: USUARIO } });

  const traducidos = d.idiomas.includes("en") ? await traducirPendientes(tienda.id) : 0;
  const plan = !d.plan ? "sin plan" : existe ? "plan ya existía" : "plan creado";
  console.log(`${slug}: ${tipos.length} tipos, ${plan}, ${traducidos} textos traducidos`);
}

await prisma.$disconnect();
