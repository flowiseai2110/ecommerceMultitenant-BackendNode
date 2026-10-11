// Carga una tienda demo de alquiler de locales (docs/specs/alquiler-locales) a
// partir de un archivo JSON: salones (con fotos de Pexels) con sus turnos y
// paquetes, la configuración de reservas (separación, cuotas, garantía,
// tramos de cancelación, proveedores) y, con --home, la portada.
// Las piezas comunes con los otros seeds están en scripts/demo/comun.js.
//
// Cada salón queda igual que si se creara desde el admin: un producto con sus
// fotos (WebP en el storage de la tienda) y su ficha (aforo, servicios, turnos
// y paquetes), guardada con guardarFichaSalon (mismas reglas que el editor).
//
// Con --crear, si la tienda no existe se registra como en onboard-cliente.mjs
// con los datos de "alta" del JSON y el dueño --owner (si el usuario no existe
// en Supabase Auth se crea con --password; sin --password se le invita por email).
//
// Se puede correr varias veces: un salón que ya existe (mismo slug) no se
// duplica; se le asigna su categoría, si no tiene fotos se le agregan y, si no
// tiene ficha, se le guarda la del JSON. La configuración se vuelve a guardar.
//
// Uso (desde la raíz del backend):
//   node scripts/seed-locales.mjs --crear --owner local@yopmail.com --password <clave> --home
//   node scripts/seed-locales.mjs --tienda mi-local --datos scripts/demo/locales/mi-local.json
//   node scripts/seed-locales.mjs --limpiar           (borra los salones del script y sus categorías vacías)
//
// Formato del JSON (ver casa-alborada.json):
//   alta? { nombre, whatsappNumero, email?, ruc, razonSocial, razonComercial, direccionFiscal, direccion? }
//   tienda? { descripcion?, banner? | bannerPexels?, home?[] }   (como en seed-eventos; la galería se llena con las fotos de los salones)
//   config? { ...campos de Config. de reservas (configSchema) }
//   categorias[] { nombre, descripcion?, pexels?[] }
//   salones[] { nombre, categoria?, sku?, pexels?[], foto?, corta?, descripcion?,
//               metros?, aforoMaximo, preparacionMin?, porHoras?, precioHora?, minHoras?, horasDesde?, horasHasta?, servicios?[],
//               turnos[] { nombre, horaInicio, horaFin, diasSemana[], precios { lj, v?, s?, d?, f? } },
//               paquetes[] { nombre, descripcion?, modalidad, precioTipo?, precios?, minPersonas?, maxPersonas?, incluye?[],
//                            horasIncluidas?, horaExtraPrecio?, tiposEvento?[], esPromocion?, turnoRefs?[] (posición en turnos) } }

import "dotenv/config";
import crypto from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { optimizarImagenSubida } from "../services/image.service.js";
import { uploadPublicFile } from "../services/storage.service.js";
import { getDiseno } from "../services/tienda-diseno.service.js";
import { configSchema, salonSchema } from "../modules/reservas/reservas.schema.js";
import { guardarConfig } from "../modules/reservas/reservas.config.service.js";
import { guardarFichaSalon } from "../modules/reservas/locales/salones.service.js";
import { onboardCliente } from "../services/onboarding.service.js";
import {
  armarHome, asegurarCategorias, borrarCategoriasVacias, borrarProductos, categoriasSchema,
  crearOActualizar, fotosPexelsPorId, leerDatos, tiendaDelTipo, tiendaSchema
} from "./demo/comun.js";

const { values: args } = parseArgs({
  options: {
    tienda: { type: "string", default: "casa-alborada" },
    datos: { type: "string", default: "scripts/demo/locales/casa-alborada.json" },
    fotos: { type: "string", default: "3" },
    home: { type: "boolean", default: false },
    crear: { type: "boolean", default: false },
    owner: { type: "string" },
    password: { type: "string" },
    limpiar: { type: "boolean", default: false }
  }
});

const ETIQUETA = "seed-locales";
const USUARIO = "seed-locales";
const FOTOS = Math.min(Math.max(Number(args.fotos) || 0, 0), 6);
const PLANTILLA_HOME = "locales-salones";

// Solo lo del producto; la ficha la valida salonSchema y la configuración configSchema.
const datosSchema = z.object({
  alta: z.object({ direccion: z.string().max(300).optional() }).passthrough().optional(),
  tienda: tiendaSchema,
  config: z.record(z.any()).optional(),
  categorias: categoriasSchema,
  salones: z.array(z.object({
    nombre: z.string().min(1).max(200),
    categoria: z.string().min(1).max(100).optional(),
    sku: z.string().max(50).optional(),
    pexels: z.array(z.number().int().positive()).max(10).optional(),
    foto: z.string().optional(),
    corta: z.string().max(500).optional(),
    descripcion: z.string().optional()
  }).passthrough()).default([])
});

/** La tienda del slug; con --crear, si no existe se registra con los datos de "alta". */
async function asegurarTienda(datos) {
  const existe = await prisma.tiendas.findUnique({ where: { slug: args.tienda }, select: { id: true } });
  if (existe || !args.crear) return tiendaDelTipo(args.tienda, "locales");
  if (!datos.alta) throw new Error(`No existe la tienda "${args.tienda}" y el JSON no trae "alta" para crearla`);
  if (!args.owner) throw new Error("Para crear la tienda indica el dueño con --owner <email>");

  const { direccion, ...alta } = datos.alta;
  const r = await onboardCliente({
    owner: { email: args.owner, password: args.password ?? "" },
    tienda: { ...alta, slug: args.tienda, tipoNegocio: "locales" }
  });
  if (direccion) await prisma.tiendas.update({ where: { id: r.tienda.id }, data: { direccion } });
  console.log(`  ✓ tienda ${r.tienda.nombre} creada (${r.url})`);
  console.log(`  ✓ dueño ${r.owner.email}${r.owner.creado ? (r.owner.invitado ? " (invitación enviada)" : " (usuario creado)") : " (ya existía)"}`);
  console.log(`  · ${r.metodosPrecargados} métodos de pago precargados: actívalos en el admin para cobrar la separación`);
  return tiendaDelTipo(args.tienda, "locales");
}

/**
 * Llena la galería de la portada con las fotos de los salones (sus IDs de
 * Pexels), subidas a {tienda}/diseno como lo hace el editor: la galería solo
 * acepta fotos de esa carpeta. Si la portada ya tiene galería, la reutiliza.
 */
async function llenarGaleria(tienda, home, salones) {
  const galeria = home?.find(s => s.tipo === "galeria");
  if (!galeria || galeria.fotos?.length) return;

  const { estructura } = await getDiseno(tienda.id);
  const guardada = estructura?.home?.secciones?.find(s => s.tipo === "galeria" && s.fotos?.length >= 3);
  if (guardada) {
    Object.assign(galeria, { fotos: guardada.fotos, oculto: false });
    return;
  }

  const vistas = new Set();
  const elegidas = salones.flatMap(s => (s.pexels ?? []).map(id => ({ id, pie: s.nombre.slice(0, 80) })))
    .filter(f => !vistas.has(f.id) && vistas.add(f.id))
    .slice(0, 8);
  if (elegidas.length < 3) return;

  const fotos = await fotosPexelsPorId(elegidas.map(f => f.id));
  galeria.fotos = [];
  for (const [i, foto] of fotos.entries()) {
    const webp = await optimizarImagenSubida(foto.buffer);
    const { url } = await uploadPublicFile(`${tienda.id}/diseno/${crypto.randomUUID()}.webp`, webp, "image/webp");
    galeria.fotos.push({ url, pie: elegidas[i].pie });
  }
  galeria.oculto = false;
  console.log(`  ✓ galería: ${galeria.fotos.length} fotos`);
}

async function limpiar(tienda) {
  const productos = await prisma.productos.findMany({ where: { tiendaId: tienda.id, etiquetas: { has: ETIQUETA } }, select: { id: true } });
  const ids = productos.map(p => p.id);
  // Las reservas guardan su snapshot, pero apuntan al producto: no se borra un salón reservado.
  const conReservas = await prisma.reservas.count({ where: { productoId: { in: ids } } });
  if (conReservas) throw new Error(`Hay ${conReservas} reservas sobre estos salones: bórralas antes o desactívalos desde el admin`);
  await borrarProductos(ids);
  const borradas = await borrarCategoriasVacias(tienda.id, USUARIO);
  console.log(`Borrados ${ids.length} salones y ${borradas} categorías de ${tienda.nombre}`);
}

async function main() {
  if (args.limpiar) return limpiar(await tiendaDelTipo(args.tienda, "locales"));

  const datos = await leerDatos(args.datos, datosSchema);
  console.log(`${args.tienda} ← ${args.datos}`);
  const tienda = await asegurarTienda(datos);

  // La configuración va antes que los salones: guardarFichaSalon valida contra la hora tope.
  if (datos.config) {
    await guardarConfig(tienda.id, configSchema.parse({ tiendaId: tienda.id, ...datos.config }), { email: USUARIO });
    console.log("  ✓ configuración de reservas");
  }

  const categorias = await asegurarCategorias({ tienda, categorias: datos.categorias, items: datos.salones, usuario: USUARIO });

  const conteo = { creado: 0, actualizado: 0, error: 0 };
  for (const { nombre, categoria, sku, pexels, foto, corta, descripcion, ...ficha } of datos.salones) {
    try {
      // Validar antes de crear el producto: un dato malo no deja nada a medias.
      const fichaValida = salonSchema.parse({ tiendaId: tienda.id, ...ficha });
      const resultado = await crearOActualizar({
        tienda, item: { nombre, sku, pexels, foto, corta, descripcion }, categoriaId: categoria ? categorias.get(categoria) : null,
        etiqueta: ETIQUETA, usuario: USUARIO, fotos: FOTOS, unidad: "pieza",
        guardarFicha: (productoId) => guardarFichaSalon(tienda.id, productoId, fichaValida, { email: USUARIO }),
        tieneFicha: async (productoId) => Boolean(await prisma.local_salones.findUnique({ where: { productoId }, select: { productoId: true } }))
      });
      conteo[resultado]++;
    } catch (err) {
      conteo.error++;
      const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
      console.error(`  ✗ ${nombre}: ${detalle}`);
    }
  }

  if (args.home) {
    await llenarGaleria(tienda, datos.tienda?.home, datos.salones);
    await armarHome({ tienda, datosTienda: datos.tienda, plantillaId: PLANTILLA_HOME, usuario: USUARIO });
  }

  console.log(`Listo: ${conteo.creado} salones nuevos, ${conteo.actualizado} ya existían${conteo.error ? `, ${conteo.error} con error` : ""}.`);
}

main()
  .catch((err) => {
    const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
    console.error("Error:", detalle);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
