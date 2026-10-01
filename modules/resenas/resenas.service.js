import { prisma } from "../../config/prisma.js";
import { ForbiddenError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { invalidateProductoDetailCache } from "../catalogo/productos.cache.js";
import config from "../../config/index.js";
import { firmarTokenResena } from "./resenas.token.js";

/**
 * Reseñas de productos (valoración con estrellas).
 *
 * Regla central: solo reseña quien COMPRÓ y RECIBIÓ el producto. Se prueba con
 * un pedido `entregado` de la tienda que incluye el producto, y que además:
 *   - es de su cuenta (authUserId), si reseña con sesión, o
 *   - viene en un token firmado (link de WhatsApp), si compró como invitado.
 *
 * Los errores de negocio llevan `details.motivo` porque el errorHandler solo
 * expone code + details al cliente (no el message).
 */

const CLAVE_MODERACION = "resenas_moderacion";
const MODERACION_DEFAULT = "previa";

// ============================================
// Helpers puros
// ============================================

/**
 * "juan pérez garcía" → "Juan P."; "Ana" → "Ana"; vacío → "Cliente".
 * Nunca se publica el nombre completo del comprador. La inicial es siempre la
 * de la segunda palabra: con nombres peruanos ("Juan Pérez García") suele ser
 * el apellido paterno; si es un segundo nombre ("Ana María") igual protege.
 * @param {string|null|undefined} nombre
 * @returns {string}
 */
export function formatearNombreMostrado(nombre) {
  const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Cliente";
  const primero = partes[0].charAt(0).toLocaleUpperCase("es") + partes[0].slice(1, 40).toLocaleLowerCase("es");
  return partes[1] ? `${primero} ${partes[1].charAt(0).toLocaleUpperCase("es")}.` : primero;
}

/** Promedio redondeado a 2 decimales (lo que muestra la UI y el JSON-LD). */
const redondear = (n) => Math.round((n || 0) * 100) / 100;

/** DTO público: sin pedido, usuario, estado ni auditoría. */
export function serializeResenaStore(r) {
  return {
    id: r.id,
    estrellas: r.estrellas,
    comentario: r.comentario,
    nombreMostrado: r.nombreMostrado,
    respuestaTienda: r.respuestaTienda,
    fechaRespuesta: r.fechaRespuesta,
    fechaRegistro: r.fechaRegistro
  };
}

/** DTO del admin: incluye estado, producto y pedido para moderar con contexto. */
function serializeResenaAdmin(r) {
  return {
    ...serializeResenaStore(r),
    estado: r.estado,
    productoId: r.productoId,
    productoNombre: r.producto?.nombre ?? null,
    pedidoId: r.pedidoId,
    numeroPedido: r.pedido?.numeroPedido ?? null,
    fechaActualizacion: r.fechaActualizacion
  };
}

function meta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
}

// ============================================
// Moderación (config por tienda)
// ============================================

/**
 * @param {string} tiendaId
 * @param {object} [db] - Cliente Prisma o transacción.
 * @returns {Promise<"previa"|"automatica">}
 */
export async function getModoModeracion(tiendaId, db = prisma) {
  const row = await db.tienda_configuraciones.findUnique({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE_MODERACION } },
    select: { valor: true }
  });
  return row?.valor?.modo === "automatica" ? "automatica" : MODERACION_DEFAULT;
}

/**
 * Cambiar el modo NO toca reseñas existentes: pasar a "automatica" no aprueba
 * de golpe las pendientes (el dueño las revisa en la bandeja).
 */
export async function setModoModeracion(tiendaId, modo, user) {
  const usuario = user?.email || user?.id || "system";
  await prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE_MODERACION } },
    create: { tiendaId, clave: CLAVE_MODERACION, valor: { modo }, categoria: "resenas", usuarioRegistro: usuario },
    update: { valor: { modo }, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
  return { moderacion: modo };
}

// ============================================
// Verificación de compra y escritura
// ============================================

/**
 * Comprueba que el pedido permite reseñar el producto. Devuelve el pedido.
 * @param {object} db - Cliente Prisma o transacción.
 * @param {{ tiendaId: string, pedidoId: string, productoId: string, authUserId: string|null, porToken: boolean }} p
 */
export async function verificarCompra(db, { tiendaId, pedidoId, productoId, authUserId, porToken }) {
  const pedido = await db.pedidos.findFirst({
    where: { id: pedidoId, tiendaId },
    select: {
      id: true,
      estado: true,
      authUserId: true,
      clienteNombre: true,
      detalles: { where: { productoId }, select: { id: true } }
    }
  });

  if (!pedido) throw new NotFoundError("Pedido");

  // Con sesión, el pedido debe ser de SU cuenta. Con token, el token ya prueba
  // que recibió el link de ese pedido.
  if (!porToken && (!authUserId || pedido.authUserId !== authUserId)) {
    throw new ForbiddenError("Este pedido no pertenece a tu cuenta");
  }

  if (pedido.estado !== "entregado") {
    throw new UnprocessableError("Solo puedes calificar productos de pedidos entregados",
      { motivo: "PEDIDO_NO_ENTREGADO" });
  }

  if (!pedido.detalles.length) {
    throw new UnprocessableError("Este producto no está en el pedido", { motivo: "PRODUCTO_NO_EN_PEDIDO" });
  }

  // El detalle guarda el productoId aunque el producto se haya borrado después.
  const producto = await db.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true } });
  if (!producto) throw new NotFoundError("Producto");

  return pedido;
}

// Promedio bayesiano para "Mejor valorados": cada producto arranca con
// PRIOR_CANTIDAD reseñas "virtuales" de PRIOR_MEDIA estrellas, que se diluyen
// a medida que llegan reseñas reales. Mantener en sync con resenas_ranking.sql.
const PRIOR_MEDIA = 4;
const PRIOR_CANTIDAD = 3;

/**
 * Puntaje de ranking (0 si no hay reseñas: van al final de "Mejor valorados").
 * 5.0 con 1 reseña → 4.25; 4.9 con 40 → 4.84.
 */
export function calcularRatingScore(sumaEstrellas, cantidad) {
  if (!cantidad) return 0;
  const score = (PRIOR_CANTIDAD * PRIOR_MEDIA + sumaEstrellas) / (PRIOR_CANTIDAD + cantidad);
  return Math.round(score * 10000) / 10000;
}

/**
 * Recalcula el resumen desnormalizado del producto con las reseñas APROBADAS.
 * @param {object} db - Transacción.
 * @param {string} productoId
 */
export async function recalcularRatingProducto(db, productoId) {
  const agg = await db.resenas.aggregate({
    where: { productoId, estado: "aprobada" },
    _avg: { estrellas: true },
    _sum: { estrellas: true },
    _count: { _all: true }
  });
  const ratingCantidad = agg._count._all;
  const ratingPromedio = ratingCantidad ? redondear(agg._avg.estrellas) : 0;
  const ratingScore = calcularRatingScore(agg._sum?.estrellas ?? 0, ratingCantidad);
  await db.productos.update({ where: { id: productoId }, data: { ratingPromedio, ratingCantidad, ratingScore } });
  return { ratingPromedio, ratingCantidad, ratingScore };
}

/**
 * Crea la reseña, o la reemplaza si ya existía para (pedido, producto).
 * Editar vuelve a moderar: una reseña aprobada editada queda pendiente.
 *
 * @param {{ tiendaId: string, pedidoId: string, productoId: string, estrellas: number,
 *           comentario: string|null, authUserId: string|null, porToken: boolean }} input
 * @returns {Promise<{ resena: object, estado: string, publicada: boolean }>}
 */
export async function guardarResena(input) {
  const { tiendaId, pedidoId, productoId, estrellas, comentario, authUserId, porToken } = input;

  const resultado = await prisma.$transaction(async (tx) => {
    const pedido = await verificarCompra(tx, { tiendaId, pedidoId, productoId, authUserId, porToken });
    const modo = await getModoModeracion(tiendaId, tx);
    const estado = modo === "automatica" ? "aprobada" : "pendiente";

    const datos = {
      estrellas,
      comentario,
      estado,
      nombreMostrado: formatearNombreMostrado(pedido.clienteNombre)
    };

    const existente = await tx.resenas.findUnique({
      where: { uq_resena_pedido_producto: { pedidoId, productoId } },
      select: { id: true, authUserId: true }
    });

    const resena = existente
      ? await tx.resenas.update({
          where: { id: existente.id },
          data: {
            ...datos,
            // Si reseñó primero por link y luego con sesión, queda vinculada.
            authUserId: authUserId ?? existente.authUserId,
            fechaActualizacion: new Date(),
            usuarioActualizacion: "storefront"
          }
        })
      : await tx.resenas.create({
          data: { ...datos, tiendaId, pedidoId, productoId, authUserId, usuarioRegistro: "storefront" }
        });

    // Siempre: una edición puede sacar de "aprobada" una reseña que contaba.
    await recalcularRatingProducto(tx, productoId);

    return { resena: serializeResenaStore(resena), estado, publicada: estado === "aprobada" };
  });
  // Tras el commit (no dentro): si no, una lectura concurrente podría volver
  // a cachear el rating viejo antes de que la transacción termine.
  invalidateProductoDetailCache(productoId);
  return resultado;
}

// ============================================
// Lecturas del storefront
// ============================================

/**
 * Reseñas aprobadas de un producto + resumen (promedio, cantidad, distribución).
 * El resumen se calcula aquí (no de productos.rating*) para que sea coherente
 * con la lista aunque el denormalizado estuviera desfasado.
 */
export async function listarResenasProducto(tiendaId, productoId, { page = 1, limit = 10 } = {}) {
  const where = { tiendaId, productoId, estado: "aprobada" };

  const [data, total, grupos] = await Promise.all([
    prisma.resenas.findMany({
      where,
      orderBy: { fechaRegistro: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.resenas.count({ where }),
    prisma.resenas.groupBy({ by: ["estrellas"], where, _count: { _all: true } })
  ]);

  const distribucion = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let suma = 0;
  for (const g of grupos) {
    distribucion[g.estrellas] = g._count._all;
    suma += g.estrellas * g._count._all;
  }

  return {
    data: data.map(serializeResenaStore),
    meta: meta(total, page, limit),
    resumen: { promedio: total ? redondear(suma / total) : 0, cantidad: total, distribucion }
  };
}

/**
 * Reseñas para los testimonios del home: aprobadas, de 4-5 estrellas y CON
 * comentario (un testimonio sin texto no dice nada), las más recientes.
 */
export async function listarResenasDestacadas(tiendaId, limit = 6) {
  const data = await prisma.resenas.findMany({
    where: { tiendaId, estado: "aprobada", estrellas: { gte: 4 }, comentario: { not: null } },
    orderBy: { fechaRegistro: "desc" },
    take: limit,
    include: { producto: { select: { nombre: true } } }
  });
  return data.map(r => ({
    ...serializeResenaStore(r),
    productoId: r.productoId,
    productoNombre: r.producto?.nombre ?? null
  }));
}

/**
 * Productos que el comprador puede calificar: los de sus pedidos ENTREGADOS en
 * la tienda, con la reseña que ya dejó (si existe) para poder editarla.
 *
 * @param {string} tiendaId
 * @param {{ authUserId?: string, pedidoId?: string }} filtro - Cuenta o pedido del token.
 */
export async function listarResenables(tiendaId, filtro) {
  const where = { tiendaId, estado: "entregado" };
  if (filtro.pedidoId) where.id = filtro.pedidoId;
  else if (filtro.authUserId) where.authUserId = filtro.authUserId;
  else return [];

  const pedidos = await prisma.pedidos.findMany({
    where,
    orderBy: { fechaEntregado: "desc" },
    take: 20,
    select: {
      id: true,
      numeroPedido: true,
      fechaEntregado: true,
      detalles: { select: { productoId: true, productoNombre: true, varianteNombre: true } },
      resenas: { select: { productoId: true, estrellas: true, comentario: true, estado: true } }
    }
  });

  // Imagen principal (o la primera) de cada producto que sigue existiendo.
  const productoIds = [...new Set(pedidos.flatMap(p => p.detalles.map(d => d.productoId).filter(Boolean)))];
  const productos = productoIds.length
    ? await prisma.productos.findMany({
        where: { id: { in: productoIds }, tiendaId },
        select: {
          id: true,
          imagenes: { orderBy: [{ esPrincipal: "desc" }, { orden: "asc" }], take: 1, select: { url: true } }
        }
      })
    : [];
  const imagenPorProducto = new Map(productos.map(p => [p.id, p.imagenes[0]?.url ?? null]));

  return pedidos.map(p => {
    const resenaPorProducto = new Map(p.resenas.map(r => [r.productoId, r]));
    const vistos = new Set();
    const items = [];
    for (const d of p.detalles) {
      // Sin producto (borrado) no se puede reseñar; variantes del mismo producto, una sola vez.
      if (!d.productoId || !imagenPorProducto.has(d.productoId) || vistos.has(d.productoId)) continue;
      vistos.add(d.productoId);
      const r = resenaPorProducto.get(d.productoId);
      items.push({
        productoId: d.productoId,
        productoNombre: d.productoNombre,
        imagenUrl: imagenPorProducto.get(d.productoId),
        resena: r ? { estrellas: r.estrellas, comentario: r.comentario, estado: r.estado } : null
      });
    }
    return { pedidoId: p.id, numeroPedido: p.numeroPedido, fechaEntregado: p.fechaEntregado, items };
  }).filter(p => p.items.length);
}

// ============================================
// Link "califica tu compra" (WhatsApp tras la entrega)
// ============================================

/**
 * URL pública de una ruta de la tienda: subdominio en producción
 * (https://<slug>.<baseDomain>/<ruta>) o modo por ruta en dev
 * (<storefrontUrl>/<slug>/<ruta>).
 */
export function urlTienda(slug, ruta) {
  const { baseDomain, storefrontUrl } = config.platform;
  return baseDomain
    ? `https://${slug}.${baseDomain}/${ruta}`
    : `${storefrontUrl.replace(/\/+$/, "")}/${slug}/${ruta}`;
}

/**
 * Genera el link firmado para que el comprador califique su pedido sin cuenta.
 * Solo para pedidos ENTREGADOS: antes no hay nada que calificar.
 * @returns {Promise<{ url: string, expiraEn: string }>}
 */
export async function generarEnlaceResena(tiendaId, pedidoId) {
  const pedido = await prisma.pedidos.findFirst({
    where: { id: pedidoId, tiendaId },
    select: { id: true, estado: true }
  });
  if (!pedido) throw new NotFoundError("Pedido");
  if (pedido.estado !== "entregado") {
    throw new UnprocessableError("El pedido aún no está entregado", { motivo: "PEDIDO_NO_ENTREGADO" });
  }

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  if (!tienda) throw new NotFoundError("Tienda");

  const token = await firmarTokenResena({ pedidoId, tiendaId });
  const expiraEn = new Date(Date.now() + config.resenas.linkTtlDias * 24 * 60 * 60 * 1000).toISOString();
  return { url: urlTienda(tienda.slug, `resenar/${token}`), expiraEn };
}

// ============================================
// Admin (moderación)
// ============================================

export async function listarResenasAdmin(tiendaId, { estado, page = 1, limit = 20 } = {}) {
  const where = { tiendaId };
  if (estado) where.estado = estado;

  const [data, total, porEstadoRows] = await Promise.all([
    prisma.resenas.findMany({
      where,
      orderBy: { fechaRegistro: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        producto: { select: { nombre: true } },
        pedido: { select: { numeroPedido: true } }
      }
    }),
    prisma.resenas.count({ where }),
    prisma.resenas.groupBy({ by: ["estado"], where: { tiendaId }, _count: { _all: true } })
  ]);

  // Para el badge de pendientes y las pestañas de la bandeja.
  const porEstado = { pendiente: 0, aprobada: 0, rechazada: 0 };
  for (const g of porEstadoRows) porEstado[g.estado] = g._count._all;

  return { data: data.map(serializeResenaAdmin), meta: { ...meta(total, page, limit), porEstado } };
}

async function getResenaDeTienda(db, tiendaId, id) {
  const resena = await db.resenas.findUnique({ where: { id } });
  if (!resena || resena.tiendaId !== tiendaId) throw new NotFoundError("Reseña");
  return resena;
}

/**
 * Aprueba o rechaza. Se modera por contenido (insultos, spam, datos
 * personales), no por la nota: eso lo decide el comerciante, el sistema no.
 */
export async function cambiarEstadoResena(tiendaId, id, estado, user) {
  let productoId = null;
  const resultado = await prisma.$transaction(async (tx) => {
    const actual = await getResenaDeTienda(tx, tiendaId, id);
    const resena = await tx.resenas.update({
      where: { id },
      data: { estado, fechaActualizacion: new Date(), usuarioActualizacion: user?.email || user?.id || "system" },
      include: { producto: { select: { nombre: true } }, pedido: { select: { numeroPedido: true } } }
    });
    if (actual.estado !== estado) {
      await recalcularRatingProducto(tx, actual.productoId);
      productoId = actual.productoId;
    }
    return serializeResenaAdmin(resena);
  });
  if (productoId) invalidateProductoDetailCache(productoId);
  return resultado;
}

/** Responde (o borra la respuesta con null). No cambia el estado ni el rating. */
export async function responderResena(tiendaId, id, respuesta, user) {
  await getResenaDeTienda(prisma, tiendaId, id);
  const resena = await prisma.resenas.update({
    where: { id },
    data: {
      respuestaTienda: respuesta,
      fechaRespuesta: respuesta ? new Date() : null,
      fechaActualizacion: new Date(),
      usuarioActualizacion: user?.email || user?.id || "system"
    },
    include: { producto: { select: { nombre: true } }, pedido: { select: { numeroPedido: true } } }
  });
  return serializeResenaAdmin(resena);
}
