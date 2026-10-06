// Seed de datos sintéticos para pruebas de carga (Fase 1 del plan de rendimiento).
//
// Crea N tiendas parecidas a las reales (medias, zapatillas, ropa, belleza,
// mascotas) con categorías, productos con variantes, imágenes, clientes,
// pedidos históricos con su historial y reseñas.
//
// SOLO contra el proyecto de pruebas. Ver scripts/carga/destino.js: se niega
// con producción y exige --confirmar-db con el ref de la base del .env.
//
// Uso:
//   node scripts/seed-carga.js --tiendas 10 --confirmar-db <ref>
//   node scripts/seed-carga.js --tiendas 50 --productos 40-50 --pedidos 80-200 --confirmar-db <ref>
//   node scripts/seed-carga.js --tiendas 5 --dry-run            (solo cuenta filas, no toca la BD)
//   node scripts/seed-carga.js --limpiar --confirmar-db <ref>   (borra todo lo creado por el seed)
//
// Opciones:
//   --tiendas N            Total de tiendas (crea las que falten: 10 → 25 → 50 por escalones)
//   --productos MIN-MAX    Productos por tienda            (default 40-50)
//   --pedidos MIN-MAX      Pedidos históricos por tienda   (default 80-200)
//   --dias N               Antigüedad máxima de pedidos    (default 180)
//   --perfiles a,b         Perfiles a rotar                (default: todos)
//   --prefijo carga        Prefijo del slug (carga-001...)
//   --semilla 42           Misma semilla = mismos datos
//   --owner-email email    Usuario de Supabase Auth (del proyecto de pruebas) que
//                          queda como owner de todas las tiendas: lo usa la prueba de admin

import "./carga/entorno.js";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { verificarDestino } from "./carga/destino.js";
import { generarTienda, parsearRango, MARCA_SEED } from "./carga/generador.js";
import { NOMBRES_PERFILES } from "./carga/perfiles.js";

const { values: args } = parseArgs({
  options: {
    tiendas: { type: "string" },
    productos: { type: "string", default: "40-50" },
    pedidos: { type: "string", default: "80-200" },
    dias: { type: "string", default: "180" },
    perfiles: { type: "string", default: NOMBRES_PERFILES.join(",") },
    prefijo: { type: "string", default: "carga" },
    semilla: { type: "string", default: "42" },
    "owner-email": { type: "string" },
    "confirmar-db": { type: "string" },
    limpiar: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false }
  }
});

const LOTE = 1000; // filas por createMany

const opciones = {
  productos: parsearRango(args.productos, "productos"),
  pedidos: parsearRango(args.pedidos, "pedidos"),
  dias: Number(args.dias),
  perfiles: args.perfiles.split(",").map(s => s.trim()).filter(Boolean),
  prefijo: args.prefijo,
  semilla: Number(args.semilla)
};
for (const p of opciones.perfiles) {
  if (!NOMBRES_PERFILES.includes(p)) throw new Error(`Perfil desconocido "${p}". Disponibles: ${NOMBRES_PERFILES.join(", ")}`);
}
if (!/^[a-z][a-z0-9-]{1,20}$/.test(opciones.prefijo)) throw new Error("--prefijo: minúsculas, números y guiones");

const datosDe = (indice) => generarTienda({
  indice,
  perfil: opciones.perfiles[(indice - 1) % opciones.perfiles.length],
  prefijo: opciones.prefijo,
  semilla: opciones.semilla,
  productos: opciones.productos,
  pedidos: opciones.pedidos,
  dias: opciones.dias
});

const TABLAS = [
  ["categorias", "categorias"], ["productos", "productos"], ["producto_variantes", "variantes"],
  ["producto_imagenes", "imagenes"], ["clientes", "clientes"], ["pedidos", "pedidos"],
  ["pedido_detalles", "detalles"], ["pedido_historial_estados", "historial"], ["resenas", "resenas"]
];

const contar = (d) => Object.fromEntries(TABLAS.map(([, k]) => [k, d[k].length]));

// ── Dry run: no toca la BD ni exige destino ─────────────────────────────
if (args["dry-run"]) {
  const total = Number(args.tiendas ?? 1);
  const suma = {};
  for (let i = 1; i <= total; i++) {
    for (const [k, n] of Object.entries(contar(datosDe(i)))) suma[k] = (suma[k] ?? 0) + n;
  }
  console.log(`Dry run: ${total} tiendas →`, suma);
  process.exit(0);
}

// ── Destino verificado ANTES de cualquier consulta ──────────────────────
let ref;
try {
  ref = verificarDestino({
    databaseUrl: process.env.DATABASE_URL,
    confirmar: args["confirmar-db"],
    nodeEnv: process.env.NODE_ENV,
    prohibidosExtra: process.env.SEED_CARGA_REFS_PROHIBIDOS
  });
} catch (err) {
  console.error(`✋ ${err.message}`);
  process.exit(1);
}
console.log(`Destino verificado: ${ref}`);

const { prisma } = await import("../config/prisma.js");
const { seedMetodosPagoParaTienda } = await import("../services/metodos-pago-seed.service.js");
const { seedMetodosEnvioParaTienda } = await import("../services/metodos-envio-seed.service.js");
const { getIdRolByCodigo } = await import("../services/roles.service.js");

async function crearEnLotes(tx, modelo, filas) {
  for (let i = 0; i < filas.length; i += LOTE) {
    await tx[modelo].createMany({ data: filas.slice(i, i + LOTE) });
  }
}

/** Owner de pruebas: un usuario del Auth del proyecto de pruebas, para la prueba de admin. */
async function resolverOwner(email) {
  if (!email) return null;
  const [usuario] = await prisma.$queryRaw`SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1`;
  if (!usuario) throw new Error(`--owner-email: ${email} no existe en Supabase Auth del proyecto de pruebas. Créalo primero.`);
  const rolId = await getIdRolByCodigo("owner");
  if (!rolId) throw new Error('No existe el rol "owner" en enumerados (tipo rol_usuario): carga los datos maestros primero.');
  return { userId: usuario.id, rolId };
}

async function sembrar() {
  const total = Number(args.tiendas);
  if (!Number.isInteger(total) || total < 1) throw new Error("--tiendas N es requerido (N ≥ 1)");
  const owner = await resolverOwner(args["owner-email"]);

  const slugs = Array.from({ length: total }, (_, i) => `${opciones.prefijo}-${String(i + 1).padStart(3, "0")}`);
  const existentes = new Set((await prisma.tiendas.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })).map(t => t.slug));
  console.log(`${existentes.size} de ${total} tiendas ya existen; se crean ${total - existentes.size}.`);

  const suma = {};
  const t0 = performance.now();
  for (let i = 1; i <= total; i++) {
    if (existentes.has(slugs[i - 1])) continue;
    const t = performance.now();
    const datos = datosDe(i);

    await prisma.$transaction(async (tx) => {
      await tx.tiendas.create({ data: datos.tienda });
      // Igual que el onboarding real: contra entrega y recojo en tienda nacen activos.
      await seedMetodosPagoParaTienda(datos.tienda.id, {}, tx);
      await seedMetodosEnvioParaTienda(datos.tienda.id, {}, tx);
      for (const [modelo, clave] of TABLAS) await crearEnLotes(tx, modelo, datos[clave]);
    }, { timeout: 120_000, maxWait: 20_000 });

    const n = contar(datos);
    for (const [k, v] of Object.entries(n)) suma[k] = (suma[k] ?? 0) + v;
    console.log(`✓ ${datos.tienda.slug} (${datos.tienda.nombre}) — ${n.productos} productos, ${n.variantes} variantes, ${n.pedidos} pedidos, ${n.resenas} reseñas — ${Math.round(performance.now() - t)} ms`);
  }
  console.log(`\nListo en ${Math.round((performance.now() - t0) / 1000)} s. Filas creadas:`, suma);

  // Owner al final y sobre TODAS las tiendas del rango (también las que ya
  // existían): así --owner-email se puede agregar después sin re-sembrar.
  if (owner) {
    const tiendas = await prisma.tiendas.findMany({ where: { slug: { in: slugs }, usuarioRegistro: MARCA_SEED }, select: { id: true } });
    const { count } = await prisma.usuario_tiendas.createMany({
      data: tiendas.map(t => ({ userId: owner.userId, tiendaId: t.id, rol: owner.rolId, activo: true, usuarioRegistro: MARCA_SEED })),
      skipDuplicates: true // uq_usuario_tienda
    });
    console.log(`Owner ${args["owner-email"]}: vinculado a ${count} tiendas nuevas (${tiendas.length} en total).`);
  }
}

/**
 * Borra las tiendas del seed (slug con el prefijo Y creadas por el seed) y
 * todo lo que cuelga de ellas, incluido lo que generen las pruebas de carga
 * (pedidos de k6, conversaciones, pagos...): recorre todas las tablas con
 * tienda_id. Los hijos sin tienda_id (detalles, variantes...) caen en cascada.
 */
async function limpiar() {
  const tiendas = await prisma.tiendas.findMany({
    where: { slug: { startsWith: `${opciones.prefijo}-` }, usuarioRegistro: MARCA_SEED },
    select: { id: true }
  });
  if (!tiendas.length) return console.log("No hay tiendas del seed para borrar.");
  const ids = tiendas.map(t => t.id);

  const tablas = (await prisma.$queryRaw`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tienda_id' AND table_name <> 'tiendas'
  `).map(r => r.table_name);

  // Varias pasadas: el orden de borrado por FK no se conoce de antemano.
  let pendientes = tablas;
  for (let pasada = 1; pendientes.length && pasada <= 6; pasada++) {
    const fallidas = [];
    for (const tabla of pendientes) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE tienda_id = ANY($1::uuid[])`, ids);
      } catch {
        fallidas.push(tabla);
      }
    }
    pendientes = fallidas;
  }
  if (pendientes.length) throw new Error(`No se pudo limpiar: ${pendientes.join(", ")}`);

  await prisma.tiendas.deleteMany({ where: { id: { in: ids } } });
  console.log(`Borradas ${ids.length} tiendas del seed y sus datos.`);
}

try {
  await (args.limpiar ? limpiar() : sembrar());
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
