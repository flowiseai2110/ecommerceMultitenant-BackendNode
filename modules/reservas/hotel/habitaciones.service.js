import { prisma } from "../../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { invalidateProductoDetailCache } from "../../catalogo/productos.cache.js";
import { etiquetaModalidad } from "../reservas.serializer.js";

/**
 * Habitaciones del hotel / hostal: un `productos` (nombre, fotos, descripción,
 * SEO, reseñas) + su ficha 1:1 en `hotel_tipos_habitacion` + modalidades de
 * estadía (noche y bloques de horas). La ficha se edita aparte del producto.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));

const serializarModalidad = (m) => ({
  id: m.id,
  tipo: m.tipo,
  horas: m.horas,
  precio: num(m.precio),
  precioVieSab: num(m.precioVieSab),
  activo: m.activo,
  orden: m.orden,
  etiqueta: m.tipo === "horas" ? `${m.horas} horas` : "Noche"
});

function serializarFicha(t) {
  return {
    capacidadAdultos: t.capacidadAdultos,
    capacidadNinos: t.capacidadNinos,
    capacidadMax: t.capacidadMax,
    porPersona: t.porPersona,
    camas: t.camas,
    amenities: t.amenities
  };
}

/** Precio "desde" de la tarjeta: la modalidad activa más barata (spec R2.2). */
function precioDesde(modalidades) {
  const activas = modalidades.filter(m => m.activo);
  if (!activas.length) return null;
  const min = activas.reduce((a, b) => (Number(b.precio) < Number(a.precio) ? b : a));
  return { precio: num(min.precio), etiqueta: etiquetaModalidad(min) };
}

const SELECT_PRODUCTO_STORE = {
  id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true,
  ratingPromedio: true, ratingCantidad: true, destacado: true,
  imagenes: { select: { url: true, textoAlternativo: true, esPrincipal: true, orden: true }, orderBy: { orden: "asc" } },
  hotelTipo: { include: { modalidades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { precio: "asc" }] } } }
};

function serializarHabitacionStore(p, { detalle = false } = {}) {
  const t = p.hotelTipo;
  const imagenes = detalle ? p.imagenes : p.imagenes.filter(i => i.esPrincipal).concat(p.imagenes.filter(i => !i.esPrincipal)).slice(0, 1);
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcionCorta: p.descripcionCorta,
    ...(detalle ? { descripcion: p.descripcion } : {}),
    imagenes: imagenes.map(i => ({ url: i.url, alt: i.textoAlternativo ?? p.nombre })),
    rating: { promedio: p.ratingPromedio, cantidad: p.ratingCantidad },
    destacado: p.destacado,
    ...serializarFicha(t),
    modalidades: t.modalidades.map(serializarModalidad),
    desde: precioDesde(t.modalidades)
  };
}

// ============================================
// Store
// ============================================

export async function listarHabitacionesStore(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId, activo: true, hotelTipo: { isNot: null } },
    orderBy: [{ destacado: "desc" }, { precioBase: "asc" }],
    select: SELECT_PRODUCTO_STORE
  });
  return productos.filter(p => p.hotelTipo.modalidades.length).map(p => serializarHabitacionStore(p));
}

export async function obtenerHabitacionStore(tiendaId, slug) {
  const p = await prisma.productos.findFirst({
    where: { tiendaId, slug, activo: true, hotelTipo: { isNot: null } },
    select: SELECT_PRODUCTO_STORE
  });
  if (!p || !p.hotelTipo.modalidades.length) throw new NotFoundError("Habitación", "Habitación no encontrada");
  return serializarHabitacionStore(p, { detalle: true });
}

/**
 * Para cotizar / crear una solicitud: producto activo de la tienda, su ficha
 * y la modalidad elegida (que debe pertenecerle).
 */
export async function cargarHabitacionParaReserva(tiendaId, productoId, modalidadId) {
  const producto = await prisma.productos.findFirst({
    where: { id: productoId, tiendaId, activo: true },
    select: { id: true, nombre: true, hotelTipo: { include: { modalidades: { where: { id: modalidadId } } } } }
  });
  if (!producto?.hotelTipo) throw new NotFoundError("Habitación", "Habitación no encontrada");
  const modalidad = producto.hotelTipo.modalidades[0];
  if (!modalidad) throw new ValidationError("Elige una modalidad de estadía válida", { message: "Elige una modalidad de estadía válida", motivo: "MODALIDAD_INVALIDA" });
  return { producto, tipo: producto.hotelTipo, modalidad };
}

// ============================================
// Admin
// ============================================

async function productoDeTienda(tiendaId, productoId) {
  const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true, nombre: true } });
  if (!producto) throw new NotFoundError("Producto");
  return producto;
}

/**
 * Productos de la tienda con el estado de su ficha de hotel: cuáles ya se
 * publican como habitación (tienen modalidades) y cuáles faltan configurar.
 */
export async function listarHabitacionesAdmin(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true, nombre: true, slug: true, activo: true,
      imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
      hotelTipo: { include: { modalidades: { orderBy: [{ orden: "asc" }, { precio: "asc" }] } } }
    }
  });
  return productos.map(p => ({
    productoId: p.id,
    nombre: p.nombre,
    slug: p.slug,
    activo: p.activo,
    imagenUrl: (p.imagenes.find(i => i.esPrincipal) ?? p.imagenes[0])?.url ?? null,
    configurada: Boolean(p.hotelTipo?.modalidades.some(m => m.activo)),
    capacidadMax: p.hotelTipo?.capacidadMax ?? null,
    porPersona: p.hotelTipo?.porPersona ?? false,
    modalidades: (p.hotelTipo?.modalidades ?? []).map(serializarModalidad),
    desde: p.hotelTipo ? precioDesde(p.hotelTipo.modalidades) : null
  }));
}

/** Ficha de hotel de un producto (null si todavía no la tiene). */
export async function obtenerFichaAdmin(tiendaId, productoId) {
  await productoDeTienda(tiendaId, productoId);
  const t = await prisma.hotel_tipos_habitacion.findFirst({
    where: { productoId, tiendaId },
    include: { modalidades: { orderBy: [{ orden: "asc" }, { precio: "asc" }] } }
  });
  return t ? { productoId, ...serializarFicha(t), modalidades: t.modalidades.map(serializarModalidad) } : null;
}

/**
 * Guarda la ficha y reemplaza la lista de modalidades en una transacción (el
 * editor trabaja la lista entera, como las zonas de envío). Además deja el
 * producto como servicio (sin control de stock) y con `precioBase` = el precio
 * "desde", para que las tarjetas y el SEO muestren un precio real.
 */
export async function guardarFicha(tiendaId, productoId, data, user) {
  await productoDeTienda(tiendaId, productoId);
  const usuario = user?.email ?? user?.id ?? null;
  const ficha = {
    capacidadAdultos: data.capacidadAdultos,
    capacidadNinos: data.capacidadNinos,
    capacidadMax: data.capacidadMax,
    porPersona: data.porPersona,
    camas: data.camas,
    amenities: data.amenities
  };

  await prisma.$transaction(async (tx) => {
    await tx.hotel_tipos_habitacion.upsert({
      where: { productoId },
      create: { productoId, tiendaId, ...ficha },
      update: ficha
    });

    const idsConservados = data.modalidades.filter(m => m.id).map(m => m.id);
    // Las reservas guardan su snapshot de precio: borrar una modalidad no las afecta (FK SET NULL).
    await tx.hotel_modalidades.deleteMany({ where: { productoId, tiendaId, id: { notIn: idsConservados } } });
    for (const m of data.modalidades) {
      const valores = {
        tipo: m.tipo,
        horas: m.tipo === "horas" ? m.horas : null,
        precio: m.precio,
        precioVieSab: m.tipo === "noche" ? m.precioVieSab : null,
        activo: m.activo,
        orden: m.orden
      };
      if (m.id) {
        const { count } = await tx.hotel_modalidades.updateMany({ where: { id: m.id, productoId, tiendaId }, data: valores });
        if (count === 0) throw new ValidationError("Una de las modalidades no pertenece a esta habitación", { message: "Una de las modalidades no pertenece a esta habitación" });
      } else {
        await tx.hotel_modalidades.create({ data: { ...valores, productoId, tiendaId } });
      }
    }

    const activas = data.modalidades.filter(m => m.activo);
    const desde = activas.length ? Math.min(...activas.map(m => m.precio)) : Math.min(...data.modalidades.map(m => m.precio));
    await tx.productos.update({
      where: { id: productoId },
      data: { esServicio: true, precioBase: desde, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
    });
  });

  invalidateProductoDetailCache(productoId);
  return obtenerFichaAdmin(tiendaId, productoId);
}
