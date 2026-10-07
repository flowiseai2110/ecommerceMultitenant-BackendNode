// Carga eventos de ejemplo (con fotos de Pexels) en una tienda de eventos, a
// partir de un archivo JSON. Para otra tanda de eventos o para otra tienda,
// copia scripts/demo/eventos/evento-test.json, cambia los datos y pásalo con
// --datos. Las piezas comunes con seed-tours.mjs están en scripts/demo/comun.js.
//
// Cada evento queda igual que si se creara desde el admin: un producto con sus
// fotos (WebP en el storage de la tienda), su categoría y su ficha de evento con
// funciones y tipos de entrada, guardada con guardarFichaEvento (mismas reglas
// y validación que el editor).
//
// Se puede correr varias veces: un evento que ya existe (mismo slug) no se
// duplica; solo se le asigna su categoría y, si no tiene fotos, se le agregan.
// Las categorías se crean si no existen (por slug) y se reutilizan si ya están.
//
// Uso (desde la raíz del backend):
//   node scripts/seed-eventos.mjs                                  (evento-test con el JSON de ejemplo)
//   node scripts/seed-eventos.mjs --tienda mi-tienda --datos scripts/demo/eventos/mis-eventos.json
//   node scripts/seed-eventos.mjs --home        (además arma el home: plantilla Cartelera, textos, banner)
//   node scripts/seed-eventos.mjs --fotos 1     (fotos por evento nuevo; default 3, máx. 6)
//   node scripts/seed-eventos.mjs --limpiar     (borra los eventos del script y sus categorías vacías)
//
// Formato del JSON (ver evento-test.json):
//   categorias[]  { nombre, descripcion?, foto? }   foto = búsqueda en Pexels (en inglés da mejores resultados)
//   eventos[]     { nombre, categoria?, foto, corta?, descripcion?, lugar?, direccion?, organizador?,
//                   edadMinima?, fecha? | dias, horas[], repetir? { veces, cadaDias }, duracionHoras?,
//                   tipos[] { nombre, precio, cupo, descripcion? } }
//                 fecha = "YYYY-MM-DD" fija; dias = a cuántos días de hoy (no vence nunca).
//   tienda?       { descripcion?, banner?, home?[] }  solo con --home. home = secciones de la
//                 estructura (mismo schema que el editor de Diseño). descripción y banner solo
//                 se ponen si la tienda no los tiene.
//
// Requiere PEXELS_API_KEY en el .env o en la terminal. Sin clave, todo se crea sin fotos.

import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { eventoSchema } from "../modules/reservas/reservas.schema.js";
import { guardarFichaEvento } from "../modules/reservas/eventos/eventos.service.js";
import {
  armarHome, asegurarCategorias, borrarCategoriasVacias, borrarProductos, categoriasSchema,
  crearOActualizar, leerDatos, tiendaDelTipo, tiendaSchema
} from "./demo/comun.js";

const { values: args } = parseArgs({
  options: {
    tienda: { type: "string", default: "evento-test" },
    datos: { type: "string", default: "scripts/demo/eventos/evento-test.json" },
    fotos: { type: "string", default: "3" },
    home: { type: "boolean", default: false },
    limpiar: { type: "boolean", default: false }
  }
});

const ETIQUETA = "seed-eventos";
const USUARIO = "seed-eventos";
const FOTOS = Math.min(Math.max(Number(args.fotos) || 0, 0), 6);
const PLANTILLA_HOME = "eventos-cartelera";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");
const datosSchema = z.object({
  tienda: tiendaSchema,
  categorias: categoriasSchema,
  eventos: z.array(z.object({
    nombre: z.string().min(1).max(200),
    categoria: z.string().optional(),
    foto: z.string(),
    corta: z.string().max(500).optional(),
    descripcion: z.string().optional(),
    lugar: z.string().optional(),
    direccion: z.string().optional(),
    organizador: z.string().optional(),
    edadMinima: z.number().int().nullable().optional(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
    dias: z.number().int().min(0).optional(),
    horas: z.array(hora).min(1),
    repetir: z.object({ veces: z.number().int().min(1), cadaDias: z.number().int().min(1) }).optional(),
    duracionHoras: z.number().positive().optional(),
    tipos: z.array(z.object({
      nombre: z.string(), precio: z.number().min(0), cupo: z.number().int().min(1), descripcion: z.string().optional()
    })).min(1)
  }).refine(e => e.fecha || e.dias !== undefined, { message: "Cada evento necesita fecha o dias" })).default([])
});

/** Fecha de Lima (UTC-5, sin horario de verano) a `dias` de hoy, como "YYYY-MM-DD". */
function fechaLimaEn(dias) {
  return new Date(Date.now() - 5 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" + días → mismo formato. */
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DDTHH:mm" + horas → mismo formato (aritmética en UTC para no depender de la zona del equipo). */
function sumarHoras(local, horas) {
  const d = new Date(`${local}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(horas * 60));
  return d.toISOString().slice(0, 16);
}

function funcionesDe(ev) {
  const repetir = ev.repetir ?? { veces: 1, cadaDias: 0 };
  const primera = ev.fecha ?? fechaLimaEn(ev.dias);
  const funciones = [];
  for (let r = 0; r < repetir.veces; r++) {
    const fecha = sumarDias(primera, r * repetir.cadaDias);
    for (const h of ev.horas) {
      const inicio = `${fecha}T${h}`;
      funciones.push({
        nombre: ev.horas.length > 1 ? `Función ${h}` : null,
        inicio,
        fin: sumarHoras(inicio, ev.duracionHoras ?? 3),
        tipos: ev.tipos.map((t, orden) => ({ ...t, descripcion: t.descripcion ?? null, orden }))
      });
    }
  }
  return funciones;
}

async function limpiar(tienda) {
  const productos = await prisma.productos.findMany({ where: { tiendaId: tienda.id, etiquetas: { has: ETIQUETA } }, select: { id: true } });
  const ids = productos.map(p => p.id);
  const conVentas = await prisma.evento_compra_items.count({ where: { tipoEntrada: { funcion: { productoId: { in: ids } } } } });
  if (conVentas) throw new Error(`Hay ${conVentas} compras de entradas sobre estos eventos: bórralas antes o desactiva los eventos desde el admin`);
  await borrarProductos(ids);
  const borradas = await borrarCategoriasVacias(tienda.id, USUARIO);
  console.log(`Borrados ${ids.length} eventos y ${borradas} categorías de ${tienda.nombre}`);
}

async function main() {
  const tienda = await tiendaDelTipo(args.tienda, "eventos");
  if (args.limpiar) return limpiar(tienda);

  const datos = await leerDatos(args.datos, datosSchema);
  if (!process.env.PEXELS_API_KEY) console.warn("Sin PEXELS_API_KEY: todo se creará sin fotos.");
  console.log(`${tienda.nombre} (${args.tienda}) ← ${args.datos}`);

  const categorias = await asegurarCategorias({ tienda, categorias: datos.categorias, items: datos.eventos, usuario: USUARIO });

  const conteo = { creado: 0, actualizado: 0, error: 0 };
  for (const ev of datos.eventos) {
    try {
      const resultado = await crearOActualizar({
        tienda, item: ev, categoriaId: ev.categoria ? categorias.get(ev.categoria) : null,
        etiqueta: ETIQUETA, usuario: USUARIO, fotos: FOTOS, unidad: "entrada",
        guardarFicha: (productoId) => guardarFichaEvento(tienda.id, productoId, eventoSchema.parse({
          tiendaId: tienda.id,
          lugar: ev.lugar,
          direccion: ev.direccion,
          mapaUrl: ev.lugar ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.lugar, ev.direccion].filter(Boolean).join(", "))}` : null,
          edadMinima: ev.edadMinima ?? null,
          organizador: ev.organizador,
          funciones: funcionesDe(ev)
        }), { email: USUARIO })
      });
      conteo[resultado]++;
    } catch (err) {
      conteo.error++;
      console.error(`  ✗ ${ev.nombre}: ${err.message}`);
    }
  }

  if (args.home) await armarHome({ tienda, datosTienda: datos.tienda, plantillaId: PLANTILLA_HOME, usuario: USUARIO });

  console.log(`Listo: ${conteo.creado} eventos nuevos, ${conteo.actualizado} ya existían${conteo.error ? `, ${conteo.error} con error` : ""}.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
