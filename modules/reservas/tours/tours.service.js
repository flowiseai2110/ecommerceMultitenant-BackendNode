import { prisma } from "../../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { invalidateProductoDetailCache } from "../../catalogo/productos.cache.js";
import { textoDiasSalida } from "./cotizar.js";

/**
 * Tours de la agencia: un `productos` (nombre, fotos, descripción, SEO,
 * reseñas) + su ficha 1:1 en `tours` + precios por tipo de pasajero. La ficha
 * se edita aparte del producto, como la de las habitaciones.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));

const serializarTipo = (t) => ({
  id: t.id,
  nombre: t.nombre,
  precio: num(t.precio),
  activo: t.activo,
  orden: t.orden
});

function serializarFicha(t) {
  return {
    duracion: t.duracion,
    duracionHoras: t.duracionHoras,
    diasSalida: [...t.diasSalida].sort((a, b) => a - b),
    diasSalidaTexto: textoDiasSalida(t.diasSalida),
    horasSalida: [...t.horasSalida].sort(),
    idiomas: t.idiomas,
    itinerario: Array.isArray(t.itinerario) ? t.itinerario : [],
    incluye: t.incluye,
    noIncluye: t.noIncluye,
    queLlevar: t.queLlevar,
    requisitos: t.requisitos,
    puntoEncuentro: t.puntoEncuentro,
    recojo: t.recojo,
    edadMinima: t.edadMinima,
    maxPasajeros: t.maxPasajeros
  };
}

/**
 * Precio "desde" de la tarjeta: el tipo activo más barato con precio mayor a
 * cero. Un "Niño menor de 3 gratis" no debería anunciar el tour como "desde S/ 0".
 */
function precioDesde(tipos) {
  const activos = tipos.filter(t => t.activo);
  if (!activos.length) return null;
  const pagados = activos.filter(t => Number(t.precio) > 0);
  const candidatos = pagados.length ? pagados : activos;
  const min = candidatos.reduce((a, b) => (Number(b.precio) < Number(a.precio) ? b : a));
  return { precio: num(min.precio), etiqueta: `por ${min.nombre.toLowerCase()}` };
}

const ORDEN_TIPOS = [{ orden: "asc" }, { precio: "desc" }];

const SELECT_PRODUCTO_STORE = {
  id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true,
  ratingPromedio: true, ratingCantidad: true, destacado: true,
  imagenes: { select: { url: true, textoAlternativo: true, esPrincipal: true, orden: true }, orderBy: { orden: "asc" } },
  tour: { include: { tiposPasajero: { where: { activo: true }, orderBy: ORDEN_TIPOS } } }
};

function serializarTourStore(p, { detalle = false } = {}) {
  const t = p.tour;
  const imagenes = detalle ? p.imagenes : p.imagenes.filter(i => i.esPrincipal).concat(p.imagenes.filter(i => !i.esPrincipal)).slice(0, 1);
  const ficha = serializarFicha(t);
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcionCorta: p.descripcionCorta,
    ...(detalle ? { descripcion: p.descripcion } : {}),
    imagenes: imagenes.map(i => ({ url: i.url, alt: i.textoAlternativo ?? p.nombre })),
    rating: { promedio: p.ratingPromedio, cantidad: p.ratingCantidad },
    destacado: p.destacado,
    ...(detalle ? ficha : {
      duracion: ficha.duracion,
      diasSalida: ficha.diasSalida,
      diasSalidaTexto: ficha.diasSalidaTexto,
      horasSalida: ficha.horasSalida,
      idiomas: ficha.idiomas,
      edadMinima: ficha.edadMinima
    }),
    tiposPasajero: t.tiposPasajero.map(serializarTipo),
    desde: precioDesde(t.tiposPasajero)
  };
}

const publicable = (p) => p.tour.tiposPasajero.length > 0 && p.tour.horasSalida.length > 0;

// ============================================
// Store
// ============================================

export async function listarToursStore(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId, activo: true, tour: { isNot: null } },
    orderBy: [{ destacado: "desc" }, { precioBase: "asc" }],
    select: SELECT_PRODUCTO_STORE
  });
  return productos.filter(publicable).map(p => serializarTourStore(p));
}

export async function obtenerTourStore(tiendaId, slug) {
  const p = await prisma.productos.findFirst({
    where: { tiendaId, slug, activo: true, tour: { isNot: null } },
    select: SELECT_PRODUCTO_STORE
  });
  if (!p || !publicable(p)) throw new NotFoundError("Tour", "Tour no encontrado");
  return serializarTourStore(p, { detalle: true });
}

/** Para cotizar / crear una solicitud: producto activo, su ficha y TODOS sus tipos (la cotización descarta los inactivos). */
export async function cargarTourParaReserva(tiendaId, productoId) {
  const producto = await prisma.productos.findFirst({
    where: { id: productoId, tiendaId, activo: true },
    select: { id: true, nombre: true, tour: { include: { tiposPasajero: { orderBy: ORDEN_TIPOS } } } }
  });
  if (!producto?.tour) throw new NotFoundError("Tour", "Tour no encontrado");
  return { producto, tour: producto.tour, tiposPasajero: producto.tour.tiposPasajero };
}

// ============================================
// Admin
// ============================================

async function productoDeTienda(tiendaId, productoId) {
  const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true, nombre: true } });
  if (!producto) throw new NotFoundError("Producto");
  return producto;
}

/** Productos de la tienda con el estado de su ficha de tour. */
export async function listarToursAdmin(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true, nombre: true, slug: true, activo: true,
      imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
      tour: { include: { tiposPasajero: { orderBy: ORDEN_TIPOS } } }
    }
  });
  return productos.map(p => ({
    productoId: p.id,
    nombre: p.nombre,
    slug: p.slug,
    activo: p.activo,
    imagenUrl: (p.imagenes.find(i => i.esPrincipal) ?? p.imagenes[0])?.url ?? null,
    configurada: Boolean(p.tour && p.tour.horasSalida.length && p.tour.tiposPasajero.some(t => t.activo)),
    duracion: p.tour?.duracion ?? null,
    diasSalidaTexto: p.tour ? textoDiasSalida(p.tour.diasSalida) : null,
    horasSalida: p.tour ? [...p.tour.horasSalida].sort() : [],
    tiposPasajero: (p.tour?.tiposPasajero ?? []).map(serializarTipo),
    desde: p.tour ? precioDesde(p.tour.tiposPasajero) : null
  }));
}

/** Ficha de tour de un producto (null si todavía no la tiene). */
export async function obtenerFichaTourAdmin(tiendaId, productoId) {
  await productoDeTienda(tiendaId, productoId);
  const t = await prisma.tours.findFirst({
    where: { productoId, tiendaId },
    include: { tiposPasajero: { orderBy: ORDEN_TIPOS } }
  });
  return t ? { productoId, ...serializarFicha(t), tiposPasajero: t.tiposPasajero.map(serializarTipo) } : null;
}

/**
 * Guarda la ficha y reemplaza la lista de tipos de pasajero en una
 * transacción. Deja el producto como servicio y con `precioBase` = el precio
 * "desde", para que las tarjetas y el SEO muestren un precio real.
 */
export async function guardarFichaTour(tiendaId, productoId, data, user) {
  await productoDeTienda(tiendaId, productoId);
  const usuario = user?.email ?? user?.id ?? null;
  const ficha = {
    duracion: data.duracion,
    duracionHoras: data.duracionHoras,
    diasSalida: [...new Set(data.diasSalida)].sort((a, b) => a - b),
    horasSalida: [...new Set(data.horasSalida)].sort(),
    idiomas: data.idiomas,
    itinerario: data.itinerario.length ? data.itinerario : undefined,
    incluye: data.incluye,
    noIncluye: data.noIncluye,
    queLlevar: data.queLlevar,
    requisitos: data.requisitos,
    puntoEncuentro: data.puntoEncuentro,
    recojo: data.recojo,
    edadMinima: data.edadMinima,
    maxPasajeros: data.maxPasajeros
  };

  await prisma.$transaction(async (tx) => {
    await tx.tours.upsert({
      where: { productoId },
      create: { productoId, tiendaId, ...ficha },
      // Sin itinerario se borra el anterior (undefined en create = columna en null).
      update: { ...ficha, itinerario: ficha.itinerario ?? null }
    });

    const idsConservados = data.tiposPasajero.filter(t => t.id).map(t => t.id);
    // Las reservas guardan el snapshot de pasajeros y precios: borrar un tipo no las afecta.
    await tx.tour_tipos_pasajero.deleteMany({ where: { productoId, tiendaId, id: { notIn: idsConservados } } });
    for (const [i, t] of data.tiposPasajero.entries()) {
      const valores = { nombre: t.nombre, precio: t.precio, activo: t.activo, orden: t.orden ?? i };
      if (t.id) {
        const { count } = await tx.tour_tipos_pasajero.updateMany({ where: { id: t.id, productoId, tiendaId }, data: valores });
        if (count === 0) throw new ValidationError("Uno de los tipos de pasajero no pertenece a este tour", { message: "Uno de los tipos de pasajero no pertenece a este tour" });
      } else {
        await tx.tour_tipos_pasajero.create({ data: { ...valores, productoId, tiendaId } });
      }
    }

    const desde = precioDesde(data.tiposPasajero) ?? { precio: 0 };
    await tx.productos.update({
      where: { id: productoId },
      data: { esServicio: true, precioBase: desde.precio, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
    });
  });

  invalidateProductoDetailCache(productoId);
  return obtenerFichaTourAdmin(tiendaId, productoId);
}
