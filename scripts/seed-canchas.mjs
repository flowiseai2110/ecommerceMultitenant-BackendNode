// Carga una tienda demo de alquiler de canchas (docs/specs/alquiler-canchas) a
// partir de un archivo JSON: canchas con su ficha (formato y precio de día y de
// noche), la configuración de reservas (horario del complejo, adelanto), los
// métodos de pago para el adelanto y, con --home, la portada.
// Las piezas comunes con los otros seeds están en scripts/demo/comun.js.
//
// Cada cancha queda igual que si se creara desde el admin: un producto (fotos
// opcionales de Pexels) con su ficha guardada con guardarFichaCancha. Sin fotos,
// la tienda dibuja la cancha.
//
// Con --crear, si la tienda no existe se registra como en onboard-cliente.mjs
// con los datos de "alta" del JSON y el dueño --owner (si el usuario no existe
// en Supabase Auth se crea con --password; sin --password se le invita por email).
//
// Se puede correr varias veces: una cancha que ya existe (mismo slug) no se
// duplica; si no tiene ficha, se le guarda la del JSON. La configuración y los
// métodos de pago se vuelven a guardar.
//
// Uso (desde la raíz del backend):
//   node scripts/seed-canchas.mjs --crear --owner canchas@yopmail.com --password <clave> --home
//   node scripts/seed-canchas.mjs --tienda mi-complejo --datos scripts/demo/canchas/mi-complejo.json
//   node scripts/seed-canchas.mjs --limpiar           (borra las canchas del script)
//
// Formato del JSON (ver los-cedros.json):
//   alta? { nombre, whatsappNumero, email?, ruc, razonSocial, razonComercial, direccionFiscal, direccion? }
//   tienda? { descripcion?, banner? | bannerPexels?, home?[] }
//   config? { ...campos de Config. de reservas (configSchema) }
//   pagos?[] { nombre (Yape, Plin…), numero, titular }   activa esos y desactiva los que no sirven para reservas
//   canchas[] { nombre, sku?, pexels?[], foto?, corta?, descripcion?,
//               formato, largoM?, anchoM?, jugadoresMax, techada?, superficie?, precioDia, precioNoche }

import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { canchaSchema, configSchema } from "../modules/reservas/reservas.schema.js";
import { guardarConfig } from "../modules/reservas/reservas.config.service.js";
import { guardarFichaCancha } from "../modules/reservas/canchas/canchas.service.js";
import { onboardCliente } from "../services/onboarding.service.js";
import { armarHome, borrarProductos, crearOActualizar, leerDatos, tiendaDelTipo, tiendaSchema } from "./demo/comun.js";

const { values: args } = parseArgs({
  options: {
    tienda: { type: "string", default: "los-cedros" },
    datos: { type: "string", default: "scripts/demo/canchas/los-cedros.json" },
    fotos: { type: "string", default: "0" },
    home: { type: "boolean", default: false },
    crear: { type: "boolean", default: false },
    owner: { type: "string" },
    password: { type: "string" },
    limpiar: { type: "boolean", default: false }
  }
});

const ETIQUETA = "seed-canchas";
const USUARIO = "seed-canchas";
const FOTOS = Math.min(Math.max(Number(args.fotos) || 0, 0), 6);
const PLANTILLA_HOME = "canchas-complejo";
// Métodos precargados que no sirven para pagar un adelanto en línea.
const SIN_ADELANTO = ["contra_entrega", "efectivo"];

// Solo lo del producto; la ficha la valida canchaSchema y la configuración configSchema.
const datosSchema = z.object({
  alta: z.object({ direccion: z.string().max(300).optional() }).passthrough().optional(),
  tienda: tiendaSchema,
  config: z.record(z.any()).optional(),
  pagos: z.array(z.object({ nombre: z.string().min(1), numero: z.string().min(6), titular: z.string().min(1) })).default([]),
  canchas: z.array(z.object({
    nombre: z.string().min(1).max(200),
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
  if (existe || !args.crear) return tiendaDelTipo(args.tienda, "canchas");
  if (!datos.alta) throw new Error(`No existe la tienda "${args.tienda}" y el JSON no trae "alta" para crearla`);
  if (!args.owner) throw new Error("Para crear la tienda indica el dueño con --owner <email>");

  const { direccion, ...alta } = datos.alta;
  const r = await onboardCliente({
    owner: { email: args.owner, password: args.password ?? "" },
    tienda: { ...alta, slug: args.tienda, tipoNegocio: "canchas" }
  });
  if (direccion) await prisma.tiendas.update({ where: { id: r.tienda.id }, data: { direccion } });
  console.log(`  ✓ tienda ${r.tienda.nombre} creada (${r.url})`);
  console.log(`  ✓ dueño ${r.owner.email}${r.owner.creado ? (r.owner.invitado ? " (invitación enviada)" : " (usuario creado)") : " (ya existía)"}`);
  return tiendaDelTipo(args.tienda, "canchas");
}

/** Activa los métodos del JSON con su número y apaga los que no sirven para pagar un adelanto. */
async function configurarPagos(tienda, pagos) {
  if (!pagos.length) return;
  const metodos = await prisma.metodos_pago.findMany({ where: { tiendaId: tienda.id }, select: { id: true, nombre: true, tipo: true } });
  for (const m of metodos) {
    const dato = pagos.find(p => p.nombre.toLowerCase() === m.nombre.toLowerCase());
    const data = dato
      ? { activo: true, cuentaInfo: { numero: dato.numero, titular: dato.titular } }
      : SIN_ADELANTO.includes(m.tipo) ? { activo: false } : null;
    if (data) await prisma.metodos_pago.update({ where: { id: m.id }, data });
  }
  console.log(`  ✓ pagos: ${pagos.map(p => p.nombre).join(", ")} activos`);
}

async function limpiar(tienda) {
  const productos = await prisma.productos.findMany({ where: { tiendaId: tienda.id, etiquetas: { has: ETIQUETA } }, select: { id: true } });
  const ids = productos.map(p => p.id);
  // Las reservas guardan su foto, pero apuntan al producto: no se borra una cancha reservada.
  const conReservas = await prisma.reservas.count({ where: { productoId: { in: ids } } });
  if (conReservas) throw new Error(`Hay ${conReservas} reservas sobre estas canchas: bórralas antes o desactívalas desde el admin`);
  await borrarProductos(ids);
  console.log(`Borradas ${ids.length} canchas de ${tienda.nombre}`);
}

async function main() {
  if (args.limpiar) return limpiar(await tiendaDelTipo(args.tienda, "canchas"));

  const datos = await leerDatos(args.datos, datosSchema);
  console.log(`${args.tienda} ← ${args.datos}`);
  const tienda = await asegurarTienda(datos);

  if (datos.config) {
    await guardarConfig(tienda.id, configSchema.parse({ tiendaId: tienda.id, ...datos.config }), { email: USUARIO });
    console.log("  ✓ configuración de reservas (horario de las canchas)");
  }
  await configurarPagos(tienda, datos.pagos);

  const conteo = { creado: 0, actualizado: 0, error: 0 };
  for (const { nombre, sku, pexels, foto, corta, descripcion, ...ficha } of datos.canchas) {
    try {
      // Validar antes de crear el producto: un dato malo no deja nada a medias.
      const { tiendaId, ...fichaValida } = canchaSchema.parse({ tiendaId: tienda.id, ...ficha });
      const resultado = await crearOActualizar({
        tienda, item: { nombre, sku, pexels, foto, corta, descripcion }, categoriaId: null,
        etiqueta: ETIQUETA, usuario: USUARIO, fotos: FOTOS, unidad: "pieza",
        guardarFicha: (productoId) => guardarFichaCancha(tienda.id, productoId, fichaValida, { email: USUARIO }),
        tieneFicha: async (productoId) => Boolean(await prisma.cancha_canchas.findUnique({ where: { productoId }, select: { productoId: true } }))
      });
      conteo[resultado]++;
    } catch (err) {
      conteo.error++;
      const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
      console.error(`  ✗ ${nombre}: ${detalle}`);
    }
  }

  if (args.home) await armarHome({ tienda, datosTienda: datos.tienda, plantillaId: PLANTILLA_HOME, usuario: USUARIO });

  console.log(`Listo: ${conteo.creado} canchas nuevas, ${conteo.actualizado} ya existían${conteo.error ? `, ${conteo.error} con error` : ""}.`);
}

main()
  .catch((err) => {
    const detalle = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : err.message;
    console.error("Error:", detalle);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
