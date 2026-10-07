// Carga tours de ejemplo (con fotos de Pexels) en una tienda de tours, a partir
// de un archivo JSON. Para otra tanda de tours o para otra tienda, copia
// scripts/demo/tours/tour-test.json, cambia los datos y pásalo con --datos.
// Las piezas comunes con seed-eventos.mjs están en scripts/demo/comun.js.
//
// Cada tour queda igual que si se creara desde el admin: un producto con sus
// fotos (WebP en el storage de la tienda), su categoría y su ficha de tour
// (salidas, itinerario, incluye, tipos de pasajero), guardada con
// guardarFichaTour (mismas reglas y validación que el editor).
//
// Se puede correr varias veces: un tour que ya existe (mismo slug) no se
// duplica; solo se le asigna su categoría y, si no tiene fotos, se le agregan.
// Las categorías se crean si no existen (por slug) y se reutilizan si ya están.
//
// Uso (desde la raíz del backend):
//   node scripts/seed-tours.mjs                                   (tour-test con el JSON de ejemplo)
//   node scripts/seed-tours.mjs --tienda mi-agencia --datos scripts/demo/tours/mis-tours.json
//   node scripts/seed-tours.mjs --home        (además arma el home: plantilla Catálogo, textos, banner)
//   node scripts/seed-tours.mjs --fotos 1     (fotos por tour nuevo; default 3, máx. 6)
//   node scripts/seed-tours.mjs --limpiar     (borra los tours del script y sus categorías vacías)
//
// Formato del JSON (ver tour-test.json):
//   categorias[]  { nombre, descripcion?, foto? }   foto = búsqueda en Pexels (en inglés da mejores resultados)
//   tours[]       { nombre, categoria?, foto, corta?, descripcion?, duracion?, duracionHoras?,
//                   diasSalida[] (1 = lunes … 7 = domingo), horasSalida[] ("HH:mm"), idiomas?[],
//                   itinerario?[] { dia?, hora?, titulo, descripcion? }, incluye?[], noIncluye?[],
//                   queLlevar?[], requisitos?, puntoEncuentro?, recojo?, edadMinima?, maxPasajeros?,
//                   tiposPasajero[] { nombre, precio } }
//   tienda?       { descripcion?, banner?, home?[] }  solo con --home. home = secciones de la
//                 estructura (mismo schema que el editor de Diseño). descripción y banner solo
//                 se ponen si la tienda no los tiene.
//
// La ficha se valida con el mismo schema del admin (tourSchema): un dato
// inválido se informa con el nombre del tour y el resto sigue.
//
// Requiere PEXELS_API_KEY en el .env o en la terminal. Sin clave, todo se crea sin fotos.

import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { tourSchema } from "../modules/reservas/reservas.schema.js";
import { guardarFichaTour } from "../modules/reservas/tours/tours.service.js";
import {
  armarHome, asegurarCategorias, borrarCategoriasVacias, borrarProductos, categoriasSchema,
  crearOActualizar, leerDatos, tiendaDelTipo, tiendaSchema
} from "./demo/comun.js";

const { values: args } = parseArgs({
  options: {
    tienda: { type: "string", default: "tour-test" },
    datos: { type: "string", default: "scripts/demo/tours/tour-test.json" },
    fotos: { type: "string", default: "3" },
    home: { type: "boolean", default: false },
    limpiar: { type: "boolean", default: false }
  }
});

const ETIQUETA = "seed-tours";
const USUARIO = "seed-tours";
const FOTOS = Math.min(Math.max(Number(args.fotos) || 0, 0), 6);
const PLANTILLA_HOME = "tours-catalogo";

// Solo lo del producto; la ficha la valida tourSchema al guardar.
const datosSchema = z.object({
  tienda: tiendaSchema,
  categorias: categoriasSchema,
  tours: z.array(z.object({
    nombre: z.string().min(1).max(200),
    categoria: z.string().optional(),
    foto: z.string(),
    corta: z.string().max(500).optional(),
    descripcion: z.string().optional()
  }).passthrough()).default([])
});

async function limpiar(tienda) {
  const productos = await prisma.productos.findMany({ where: { tiendaId: tienda.id, etiquetas: { has: ETIQUETA } }, select: { id: true } });
  const ids = productos.map(p => p.id);
  // Las reservas guardan su snapshot, pero apuntan al producto: no se borra un tour reservado.
  const conReservas = await prisma.reservas.count({ where: { productoId: { in: ids } } });
  if (conReservas) throw new Error(`Hay ${conReservas} reservas sobre estos tours: bórralas antes o desactiva los tours desde el admin`);
  await borrarProductos(ids);
  const borradas = await borrarCategoriasVacias(tienda.id, USUARIO);
  console.log(`Borrados ${ids.length} tours y ${borradas} categorías de ${tienda.nombre}`);
}

async function main() {
  const tienda = await tiendaDelTipo(args.tienda, "tours");
  if (args.limpiar) return limpiar(tienda);

  const datos = await leerDatos(args.datos, datosSchema);
  if (!process.env.PEXELS_API_KEY) console.warn("Sin PEXELS_API_KEY: todo se creará sin fotos.");
  console.log(`${tienda.nombre} (${args.tienda}) ← ${args.datos}`);

  const categorias = await asegurarCategorias({ tienda, categorias: datos.categorias, items: datos.tours, usuario: USUARIO });

  const conteo = { creado: 0, actualizado: 0, error: 0 };
  for (const { nombre, categoria, foto, corta, descripcion, ...ficha } of datos.tours) {
    try {
      // Validar antes de crear el producto: un dato malo no deja nada a medias.
      const fichaValida = tourSchema.parse({ tiendaId: tienda.id, ...ficha });
      const resultado = await crearOActualizar({
        tienda, item: { nombre, foto, corta, descripcion }, categoriaId: categoria ? categorias.get(categoria) : null,
        etiqueta: ETIQUETA, usuario: USUARIO, fotos: FOTOS, unidad: "persona",
        guardarFicha: (productoId) => guardarFichaTour(tienda.id, productoId, fichaValida, { email: USUARIO })
      });
      conteo[resultado]++;
    } catch (err) {
      conteo.error++;
      const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
      console.error(`  ✗ ${nombre}: ${detalle}`);
    }
  }

  if (args.home) await armarHome({ tienda, datosTienda: datos.tienda, plantillaId: PLANTILLA_HOME, usuario: USUARIO });

  console.log(`Listo: ${conteo.creado} tours nuevos, ${conteo.actualizado} ya existían${conteo.error ? `, ${conteo.error} con error` : ""}.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
