// Completa los paquetes de celebración de una tienda de eventos (bodas,
// quinceaños, infantil): productos que un cliente contrata, no eventos con
// entradas. Los deja como servicio (sin stock: la tienda no muestra "Agotado"
// ni "Últimas unidades" y el checkout no descuenta inventario), y les pone
// descripción y foto de Pexels si no las tienen.
//
// No toca precio, categoría ni nada que ya esté lleno. Volver a correrlo no
// duplica fotos.
//
// Uso (desde la raíz del backend):
//   node scripts/completar-paquetes.mjs --tienda evento-test
//
// Requiere PEXELS_API_KEY en el .env o en la terminal para las fotos.

import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../config/prisma.js";
import { processAndUploadImage } from "../services/image.service.js";
import { invalidateProductoDetailCache } from "../modules/catalogo/productos.cache.js";

const { values: args } = parseArgs({
  options: { tienda: { type: "string", default: "evento-test" } }
});

const USUARIO = "completar-paquetes";

// Por slug del producto.
const PAQUETES = {
  "bodas-de-oro": {
    foto: "golden anniversary celebration elderly couple",
    corta: "Celebra 50 años juntos con una fiesta a la altura.",
    descripcion: "Paquete para celebrar las bodas de oro: decoración en dorado y blanco, mesa principal para la pareja, torta de aniversario, brindis y música para toda la noche. Coordinamos contigo la fecha, el número de invitados y los detalles."
  },
  "bodas-de-plata": {
    foto: "silver wedding anniversary party table",
    corta: "25 años de amor merecen una gran celebración.",
    descripcion: "Paquete para celebrar las bodas de plata: decoración en plateado, mesa principal, torta, brindis, música y fotografía del momento. Coordinamos contigo la fecha, el número de invitados y los detalles."
  },
  "quinceanos": {
    foto: "quinceanera party",
    corta: "La fiesta de 15 que siempre soñó.",
    descripcion: "Paquete de quinceaños: decoración temática, entrada de la quinceañera, vals, torta, hora loca y DJ. Coordinamos contigo la fecha, el número de invitados y el estilo de la fiesta."
  },
  "infantil": {
    foto: "kids birthday party balloons",
    corta: "Cumpleaños infantil con juegos, animación y torta.",
    descripcion: "Paquete de fiesta infantil: decoración con globos según la temática, animador, juegos, show, torta y sorpresas para los niños. Coordinamos contigo la fecha, el número de niños y la temática."
  }
};

async function fotoPexels(consulta) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(consulta)}&per_page=5`, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels respondió ${res.status} para "${consulta}"`);
  const foto = (await res.json()).photos?.[0];
  if (!foto) return null;
  const img = await fetch(foto.src.large2x);
  if (!img.ok) throw new Error(`No se pudo descargar la foto de "${consulta}"`);
  return { buffer: Buffer.from(await img.arrayBuffer()), autor: foto.photographer };
}

async function main() {
  const tienda = await prisma.tiendas.findUnique({ where: { slug: args.tienda }, select: { id: true, nombre: true } });
  if (!tienda) throw new Error(`No existe la tienda con slug "${args.tienda}"`);
  if (!process.env.PEXELS_API_KEY) console.warn("Sin PEXELS_API_KEY: no se agregarán fotos.");

  const productos = await prisma.productos.findMany({
    where: { tiendaId: tienda.id, slug: { in: Object.keys(PAQUETES) } },
    select: { id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true, _count: { select: { imagenes: true } } }
  });
  const faltan = Object.keys(PAQUETES).filter(s => !productos.some(p => p.slug === s));
  if (faltan.length) console.warn(`No están en ${tienda.nombre}: ${faltan.join(", ")}`);

  for (const p of productos) {
    const paquete = PAQUETES[p.slug];
    try {
      let foto = null;
      if (p._count.imagenes === 0) {
        foto = await fotoPexels(paquete.foto);
        if (foto) {
          const { webp } = await processAndUploadImage(foto.buffer, `${p.slug}.jpg`, { fit: "cover", folder: `${tienda.id}/productos` });
          await prisma.producto_imagenes.create({
            data: {
              productoId: p.id, url: webp.url, storagePath: webp.path,
              textoAlternativo: `${p.nombre} (foto: ${foto.autor} / Pexels)`.slice(0, 200),
              orden: 0, esPrincipal: true, usuarioRegistro: USUARIO
            }
          });
        }
      }
      await prisma.productos.update({
        where: { id: p.id },
        data: {
          esServicio: true,
          descripcion: p.descripcion ?? paquete.descripcion,
          descripcionCorta: p.descripcionCorta ?? paquete.corta,
          fechaActualizacion: new Date(),
          usuarioActualizacion: USUARIO
        }
      });
      invalidateProductoDetailCache(p.id);
      console.log(`  ✓ ${p.nombre}${foto ? " (+ foto)" : ""}`);
    } catch (err) {
      console.error(`  ✗ ${p.nombre}: ${err.message}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
