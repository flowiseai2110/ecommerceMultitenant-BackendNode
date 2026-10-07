// Carga habitaciones (con fotos de Pexels) en una tienda de hotel, a partir de
// un archivo JSON. Para otro hotel, copia scripts/demo/hotel/demobooking.json,
// cambia los datos y pásalo con --tienda y --datos.
// Las piezas comunes con seed-tours.mjs y seed-eventos.mjs están en scripts/demo/comun.js.
//
// Cada habitación queda igual que si se creara desde el admin: un producto con
// sus fotos (WebP en el storage de la tienda) y su ficha de estadía
// (capacidad, camas, servicios y modalidades: noche y bloques de horas),
// guardada con guardarFicha (mismas reglas y validación que el editor).
//
// Cada habitación va en su tipo de habitación (las categorías de un hotel):
// `categoria`, o por defecto uno con su mismo nombre. Los tipos que falten se
// crean con la portada y la descripción corta de la primera habitación que los usa.
//
// Se puede correr varias veces: una habitación que ya existe (mismo slug) no
// se duplica; se le asigna su tipo, si no tiene fotos se le agregan y, si no
// tiene ficha (creada a mano sin terminar), se le guarda la del JSON. Un tipo
// que ya existe (mismo slug) se reutiliza tal cual.
//
// Uso (desde la raíz del backend):
//   node scripts/seed-habitaciones.mjs                     (demobooking con el JSON de ejemplo)
//   node scripts/seed-habitaciones.mjs --tienda mi-hotel --datos scripts/demo/hotel/mi-hotel.json
//   node scripts/seed-habitaciones.mjs --limpiar           (borra las habitaciones del script y sus tipos vacíos)
//
// Formato del JSON (ver demobooking.json):
//   habitaciones[] { nombre, categoria? (tipo de habitación; por defecto el nombre), sku?, pexels?[] (IDs de fotos de Pexels, en orden; la primera es la portada),
//                    foto? (búsqueda en Pexels si no hay IDs; requiere PEXELS_API_KEY), corta?, descripcion?,
//                    capacidadAdultos, capacidadNinos?, capacidadMax, porPersona?, camas?, amenities?[],
//                    modalidades[] { tipo: "noche" | "horas", horas?, precio, precioVieSab?, orden? } }
//
// La ficha se valida con el mismo schema del admin (habitacionSchema): un dato
// inválido se informa con el nombre de la habitación y el resto sigue.

import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { habitacionSchema } from "../modules/reservas/reservas.schema.js";
import { guardarFicha } from "../modules/reservas/hotel/habitaciones.service.js";
import {
  asegurarCategorias, borrarCategoriasVacias, borrarProductos, crearOActualizar, leerDatos, tiendaDelTipo
} from "./demo/comun.js";

const { values: args } = parseArgs({
  options: {
    tienda: { type: "string", default: "demobooking" },
    datos: { type: "string", default: "scripts/demo/hotel/demobooking.json" },
    fotos: { type: "string", default: "3" },
    limpiar: { type: "boolean", default: false }
  }
});

const ETIQUETA = "seed-habitaciones";
const USUARIO = "seed-habitaciones";
const FOTOS = Math.min(Math.max(Number(args.fotos) || 0, 0), 6);

// Solo lo del producto; la ficha la valida habitacionSchema al guardar.
const datosSchema = z.object({
  habitaciones: z.array(z.object({
    nombre: z.string().min(1).max(200),
    categoria: z.string().min(1).max(100).optional(),
    sku: z.string().max(50).optional(),
    pexels: z.array(z.number().int().positive()).max(10).optional(),
    foto: z.string().optional(),
    corta: z.string().max(500).optional(),
    descripcion: z.string().optional()
  }).passthrough()).default([])
});

async function limpiar(tienda) {
  const productos = await prisma.productos.findMany({ where: { tiendaId: tienda.id, etiquetas: { has: ETIQUETA } }, select: { id: true } });
  const ids = productos.map(p => p.id);
  // Las reservas guardan su snapshot, pero apuntan al producto: no se borra una habitación reservada.
  const conReservas = await prisma.reservas.count({ where: { productoId: { in: ids } } });
  if (conReservas) throw new Error(`Hay ${conReservas} reservas sobre estas habitaciones: bórralas antes o desactívalas desde el admin`);
  await borrarProductos(ids);
  const borradas = await borrarCategoriasVacias(tienda.id, USUARIO);
  console.log(`Borradas ${ids.length} habitaciones y ${borradas} tipos de habitación de ${tienda.nombre}`);
}

async function main() {
  const tienda = await tiendaDelTipo(args.tienda, "hotel");
  if (args.limpiar) return limpiar(tienda);

  const datos = await leerDatos(args.datos, datosSchema);
  console.log(`${tienda.nombre} (${args.tienda}) ← ${args.datos}`);

  for (const h of datos.habitaciones) h.categoria ??= h.nombre;
  const tipos = [...new Map(datos.habitaciones.map(h => [h.categoria, { nombre: h.categoria, descripcion: h.corta, foto: h.foto, pexels: h.pexels?.slice(0, 1) }])).values()];
  const categorias = await asegurarCategorias({ tienda, categorias: tipos, items: [], usuario: USUARIO });

  const conteo = { creado: 0, actualizado: 0, error: 0 };
  for (const { nombre, categoria, sku, pexels, foto, corta, descripcion, ...ficha } of datos.habitaciones) {
    try {
      // Validar antes de crear el producto: un dato malo no deja nada a medias.
      const fichaValida = habitacionSchema.parse({ tiendaId: tienda.id, ...ficha });
      const resultado = await crearOActualizar({
        tienda, item: { nombre, sku, pexels, foto, corta, descripcion }, categoriaId: categorias.get(categoria),
        etiqueta: ETIQUETA, usuario: USUARIO, fotos: FOTOS, unidad: "pieza",
        guardarFicha: (productoId) => guardarFicha(tienda.id, productoId, fichaValida, { email: USUARIO }),
        tieneFicha: async (productoId) => Boolean(await prisma.hotel_tipos_habitacion.findUnique({ where: { productoId }, select: { productoId: true } }))
      });
      conteo[resultado]++;
    } catch (err) {
      conteo.error++;
      const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
      console.error(`  ✗ ${nombre}: ${detalle}`);
    }
  }

  console.log(`Listo: ${conteo.creado} habitaciones nuevas, ${conteo.actualizado} ya existían${conteo.error ? `, ${conteo.error} con error` : ""}.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
