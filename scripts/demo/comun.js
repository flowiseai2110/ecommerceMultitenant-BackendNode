// Piezas compartidas de los scripts de datos de ejemplo (seed-eventos.mjs,
// seed-tours.mjs): fotos de Pexels, categorías, productos de reserva con su
// ficha, home de la tienda y limpieza.
//
// Todo lo creado lleva una marca para poder borrarlo sin tocar lo del dueño:
// una etiqueta en los productos y el autor (usuarioRegistro) en las categorías.

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { optimizarImagenSubida, processAndUploadImage } from "../../services/image.service.js";
import { deletePublicFiles, uploadPublicFile } from "../../services/storage.service.js";
import { upsertClave } from "../../services/tienda-diseno.service.js";
import { invalidateProductoDetailCache } from "../../modules/catalogo/productos.cache.js";
import { aplicarPlantilla, validarEstructuraDeTienda } from "../../modules/diseno/diseno.service.js";
import { estructuraSchema } from "../../modules/diseno/secciones.schema.js";

export const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ── Archivo de datos ────────────────────────────────────────────────────────

/** Parte común del JSON: datos de la tienda (home) y categorías. */
export const tiendaSchema = z.object({
  descripcion: z.string().max(1000).optional(),
  banner: z.string().optional(),
  home: z.array(z.any()).optional()
}).optional();

export const categoriasSchema = z.array(z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().optional(),
  foto: z.string().optional(),
  pexels: z.array(z.number().int().positive()).max(1).optional()
})).default([]);

/** Lee y valida el JSON; el error dice qué campo de qué archivo falla. */
export async function leerDatos(ruta, schema) {
  const parsed = schema.safeParse(JSON.parse(await readFile(ruta, "utf8")));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new Error(`${ruta}: ${i.path.join(".")}: ${i.message}`);
  }
  return parsed.data;
}

/** La tienda por slug, exigiendo su tipo de negocio. */
export async function tiendaDelTipo(slug, tipoNegocio) {
  const tienda = await prisma.tiendas.findUnique({ where: { slug }, select: { id: true, nombre: true, tipoNegocio: true } });
  if (!tienda) throw new Error(`No existe la tienda con slug "${slug}"`);
  if (tienda.tipoNegocio !== tipoNegocio) {
    throw new Error(`La tienda "${slug}" es de tipo "${tienda.tipoNegocio}", no "${tipoNegocio}"`);
  }
  return tienda;
}

// ── Fotos ───────────────────────────────────────────────────────────────────

/** Hasta `cantidad` fotos de Pexels para una búsqueda: [{ buffer, autor }]. Sin PEXELS_API_KEY, []. */
export async function fotosPexels(consulta, cantidad, { orientacion = "landscape" } = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !consulta || cantidad < 1) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(consulta)}&per_page=${cantidad}&orientation=${orientacion}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels respondió ${res.status} para "${consulta}"`);
  const { photos = [] } = await res.json();
  const fotos = [];
  for (const foto of photos.slice(0, cantidad)) {
    const img = await fetch(foto.src.large2x);
    if (img.ok) fotos.push({ buffer: Buffer.from(await img.arrayBuffer()), autor: foto.photographer });
  }
  return fotos;
}

/**
 * Fotos de Pexels elegidas a mano, por ID (el número al final de la URL de la
 * foto). Se bajan del CDN público, sin PEXELS_API_KEY: [{ buffer, autor: null }].
 */
export async function fotosPexelsPorId(ids) {
  const fotos = [];
  for (const id of ids) {
    const img = await fetch(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1880`);
    if (!img.ok) throw new Error(`Pexels respondió ${img.status} para la foto ${id}`);
    fotos.push({ buffer: Buffer.from(await img.arrayBuffer()), autor: null });
  }
  return fotos;
}

/**
 * Sube fotos de Pexels como imágenes del producto (igual que el admin: WebP cover en {tienda}/productos).
 * Con `ids` usa esas fotos en ese orden; si no, las `cantidad` primeras de la búsqueda `consulta`.
 */
export async function agregarFotos({ tiendaId, productoId, nombre, consulta, cantidad, ids, usuario }) {
  const fotos = ids?.length ? await fotosPexelsPorId(ids) : await fotosPexels(consulta, cantidad);
  for (const [i, foto] of fotos.entries()) {
    const { webp } = await processAndUploadImage(foto.buffer, `${slugify(nombre)}.jpg`, { fit: "cover", folder: `${tiendaId}/productos` });
    await prisma.producto_imagenes.create({
      data: {
        productoId, url: webp.url, storagePath: webp.path,
        textoAlternativo: `${nombre} (foto: ${foto.autor ? `${foto.autor} / ` : ""}Pexels)`.slice(0, 200),
        orden: i, esPrincipal: i === 0, usuarioRegistro: usuario
      }
    });
  }
  return fotos.length;
}

// ── Categorías ──────────────────────────────────────────────────────────────

/**
 * Crea las categorías que falten (por slug) con su foto: la del ID de Pexels
 * (`pexels`) o la primera de la búsqueda `foto`. Una categoría usada por un
 * item pero no declarada se crea igual, con la foto (o la primera foto) del item.
 * @returns {Promise<Map<string, string>>} nombre → id (incluye las que ya existían)
 */
export async function asegurarCategorias({ tienda, categorias, items, usuario }) {
  const porNombre = new Map(categorias.map(c => [c.nombre, c]));
  for (const it of items) {
    if (it.categoria && !porNombre.has(it.categoria)) porNombre.set(it.categoria, { nombre: it.categoria, foto: it.foto, pexels: it.pexels?.slice(0, 1) });
  }

  const existentes = await prisma.categorias.findMany({ where: { tiendaId: tienda.id }, select: { id: true, slug: true, orden: true } });
  const porSlug = new Map(existentes.map(c => [c.slug, c.id]));
  let orden = existentes.reduce((max, c) => Math.max(max, c.orden), -1);
  const ids = new Map();

  for (const c of porNombre.values()) {
    const slug = slugify(c.nombre);
    if (porSlug.has(slug)) {
      ids.set(c.nombre, porSlug.get(slug));
      continue;
    }
    let imagenUrl = null;
    const [foto] = c.pexels?.length ? await fotosPexelsPorId(c.pexels.slice(0, 1)) : await fotosPexels(c.foto, 1);
    if (foto) {
      // Igual que /uploads/image del admin: WebP de hasta 1200 px en {tienda}/categorias.
      const webp = await optimizarImagenSubida(foto.buffer);
      ({ url: imagenUrl } = await uploadPublicFile(`${tienda.id}/categorias/${crypto.randomUUID()}.webp`, webp, "image/webp"));
    }
    const creada = await prisma.categorias.create({
      data: { tiendaId: tienda.id, nombre: c.nombre, slug, descripcion: c.descripcion ?? null, imagenUrl, orden: ++orden, usuarioRegistro: usuario },
      select: { id: true }
    });
    ids.set(c.nombre, creada.id);
    porSlug.set(slug, creada.id);
    console.log(`  + categoría ${c.nombre}${imagenUrl ? "" : " (sin foto)"}`);
  }
  return ids;
}

// ── Productos de reserva (evento, tour, habitación…) ────────────────────────────────

/**
 * Crea el producto con fotos y su ficha, o, si ya existe (mismo slug), solo le
 * asigna la categoría, le agrega fotos si no tiene y, con `tieneFicha`, le
 * guarda la ficha si le falta (un producto creado a mano sin terminar). Si la
 * ficha falla, el producto recién creado se borra para no dejarlo a medias.
 *
 * @param {object} o
 * @param {object} o.item        Entrada del JSON: nombre, foto? (búsqueda), pexels? (IDs de fotos), sku?, corta?, descripcion?
 * @param {(productoId: string) => Promise<void>} o.guardarFicha  Guarda la ficha con el servicio del rubro.
 * @param {(productoId: string) => Promise<boolean>} [o.tieneFicha] Si se pasa, a un producto existente sin ficha se le guarda.
 * @returns {Promise<"creado" | "actualizado">}
 */
export async function crearOActualizar({ tienda, item, categoriaId, etiqueta, usuario, fotos, unidad, guardarFicha, tieneFicha }) {
  const slug = slugify(item.nombre);
  const existente = await prisma.productos.findFirst({
    where: { tiendaId: tienda.id, slug },
    select: { id: true, categoriaId: true, _count: { select: { imagenes: true } } }
  });

  if (existente) {
    const cambios = [];
    if (categoriaId && existente.categoriaId !== categoriaId) {
      await prisma.productos.update({
        where: { id: existente.id },
        data: { categoriaId, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
      });
      cambios.push("categoría");
    }
    if (existente._count.imagenes === 0) {
      const n = await agregarFotos({ tiendaId: tienda.id, productoId: existente.id, nombre: item.nombre, consulta: item.foto, cantidad: fotos, ids: item.pexels, usuario });
      if (n) cambios.push(`${n} fotos`);
    }
    if (tieneFicha && !(await tieneFicha(existente.id))) {
      await guardarFicha(existente.id);
      cambios.push("ficha");
    }
    if (cambios.length) invalidateProductoDetailCache(existente.id);
    console.log(`  · ${item.nombre}: ya existía${cambios.length ? ` (actualizado: ${cambios.join(", ")})` : ""}`);
    return "actualizado";
  }

  const producto = await prisma.productos.create({
    data: {
      tiendaId: tienda.id,
      categoriaId,
      nombre: item.nombre,
      slug,
      descripcion: item.descripcion ?? null,
      descripcionCorta: item.corta ?? null,
      sku: item.sku ?? null,
      precioBase: 0, // la ficha lo deja en el precio "desde"
      stock: 0,
      unidad,
      esServicio: true,
      etiquetas: [etiqueta],
      usuarioRegistro: usuario
    },
    select: { id: true }
  });

  try {
    const n = await agregarFotos({ tiendaId: tienda.id, productoId: producto.id, nombre: item.nombre, consulta: item.foto, cantidad: fotos, ids: item.pexels, usuario });
    await guardarFicha(producto.id);
    console.log(`  ✓ ${item.nombre} (${n} fotos)`);
    return "creado";
  } catch (err) {
    await borrarProductos([producto.id]);
    throw err;
  }
}

/** Borra productos (la ficha, sus hijos y las imágenes caen en cascada) y sus fotos del storage. */
export async function borrarProductos(productoIds) {
  if (!productoIds.length) return;
  const imagenes = await prisma.producto_imagenes.findMany({ where: { productoId: { in: productoIds } }, select: { storagePath: true } });
  await prisma.productos.deleteMany({ where: { id: { in: productoIds } } });
  const paths = imagenes.map(i => i.storagePath).filter(Boolean);
  if (paths.length) await deletePublicFiles(paths);
}

/** Borra las categorías creadas por el script que quedaron sin productos. Devuelve cuántas. */
export async function borrarCategoriasVacias(tiendaId, usuario) {
  const categorias = await prisma.categorias.findMany({ where: { tiendaId, usuarioRegistro: usuario }, select: { id: true } });
  let borradas = 0;
  for (const c of categorias) {
    if (await prisma.productos.count({ where: { categoriaId: c.id } })) continue;
    await prisma.categorias.delete({ where: { id: c.id } });
    borradas++;
  }
  return borradas;
}

// ── Home ────────────────────────────────────────────────────────────────────

/**
 * Pone descripción y banner si la tienda no los tiene. Si el JSON trae
 * secciones, aplica la plantilla (la estructura previa queda para "Deshacer"
 * en Diseño) y reemplaza sus secciones por las del JSON, validadas con el
 * mismo schema que el editor de Diseño.
 */
export async function armarHome({ tienda, datosTienda, plantillaId, usuario }) {
  if (!datosTienda) {
    console.log("  (el JSON no tiene \"tienda\": home sin cambios)");
    return;
  }
  const actual = await prisma.tiendas.findUnique({ where: { id: tienda.id }, select: { descripcion: true, bannerUrl: true } });
  const cambios = {};
  if (!actual.descripcion && datosTienda.descripcion) cambios.descripcion = datosTienda.descripcion;
  if (!actual.bannerUrl && datosTienda.banner) {
    const [foto] = await fotosPexels(datosTienda.banner, 1);
    if (foto) {
      // Igual que la subida de banner del admin: 1200×400 cover en {tienda}/banners.
      const { webp } = await processAndUploadImage(foto.buffer, "banner.jpg", { fit: "cover", folder: `${tienda.id}/banners`, width: 1200, height: 400 });
      Object.assign(cambios, { bannerUrl: webp.url, bannerStoragePath: webp.path });
    }
  }
  if (Object.keys(cambios).length) {
    await prisma.tiendas.update({ where: { id: tienda.id }, data: { ...cambios, fechaActualizacion: new Date(), usuarioActualizacion: usuario } });
    console.log(`  ✓ tienda: ${Object.keys(cambios).filter(k => k !== "bannerStoragePath").join(", ")}`);
  }

  if (!datosTienda.home?.length) return;
  const { estructura: base } = await aplicarPlantilla(tienda.id, plantillaId, { email: usuario });
  const estructura = estructuraSchema.parse({ ...base, home: { secciones: datosTienda.home } });
  await validarEstructuraDeTienda(tienda.id, estructura);
  await upsertClave(tienda.id, "estructura", estructura, usuario);
  console.log(`  ✓ home: plantilla ${plantillaId} con ${estructura.home.secciones.length} secciones (se puede deshacer desde Diseño)`);
}
