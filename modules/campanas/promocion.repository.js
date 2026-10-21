import { prisma } from "../../config/prisma.js";
import { runUnscoped } from "../../kernel/tenant/index.js";
import { DISENO_CATEGORIA } from "../../services/tienda-diseno.service.js";

/**
 * Lecturas y escrituras de la promoción de una campaña (docs/specs/campanas-descuento
 * T3b.2). Cada función recibe `db` (el cliente o la transacción) y filtra por
 * `tienda_id` explícito. Las reglas viven en promocion.js (pura) y el orden de
 * la operación en promocion.service.js.
 */

const SELECT_PROMOCION = {
  id: true, campanaId: true, porcentaje: true, alcance: true, permitirCupones: true, permitirEnvioGratis: true, version: true,
  categorias: { select: { categoriaId: true } },
  productos: { select: { productoId: true } },
  cupon: { select: { id: true, codigo: true, tipo: true, valor: true, minimoCompra: true, usoMaximo: true, usoMaximoPorCliente: true, usoActual: true } }
};

const aPromocion = (fila) => fila && {
  id: fila.id,
  campanaId: fila.campanaId,
  porcentaje: fila.porcentaje,
  alcance: fila.alcance,
  permitirCupones: fila.permitirCupones,
  permitirEnvioGratis: fila.permitirEnvioGratis,
  version: fila.version,
  categoriaIds: fila.categorias.map((c) => c.categoriaId),
  productoIds: fila.productos.map((p) => p.productoId),
  cupon: fila.cupon
    ? { ...fila.cupon, valor: Number(fila.cupon.valor), minimoCompra: Number(fila.cupon.minimoCompra) }
    : null
};

/**
 * Bloquea la fila "campanas" de la tienda hasta el fin de la transacción y
 * devuelve su arreglo ([] si la tienda nunca guardó campañas). Dos guardados de
 * campañas de la misma tienda no se pisan (decisión E2).
 */
export async function bloquearCampanas(tx, tiendaId) {
  const filas = await tx.$queryRaw`
    SELECT valor FROM tienda_configuraciones
     WHERE tienda_id = ${tiendaId}::uuid AND categoria = ${DISENO_CATEGORIA} AND clave = 'campanas'
     FOR UPDATE`;
  const valor = filas?.[0]?.valor;
  return Array.isArray(valor) ? valor : [];
}

export async function tipoNegocioDe(db, tiendaId) {
  const tienda = await db.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } });
  return tienda ? tienda.tipoNegocio : undefined;
}

/** La promoción de una campaña con sus ids de alcance y su cupón, o null. */
export async function leerPromocion(db, tiendaId, campanaId) {
  const fila = await db.campana_promociones.findUnique({
    where: { uq_promocion_campana: { tiendaId, campanaId } },
    select: SELECT_PROMOCION
  });
  return aPromocion(fila);
}

/**
 * La campaña (tal como está en el JSON de la tienda) de una promoción, o null.
 * Para nombrar el cupón de una campaña que ya no está vigente (R4.8).
 */
export async function campanaDePromocion(db, tiendaId, promocionId) {
  const [promocion, fila] = await Promise.all([
    db.campana_promociones.findFirst({ where: { id: promocionId, tiendaId }, select: { campanaId: true } }),
    db.tienda_configuraciones.findFirst({
      where: { tiendaId, categoria: DISENO_CATEGORIA, clave: "campanas" },
      select: { valor: true }
    })
  ]);
  if (!promocion || !Array.isArray(fila?.valor)) return null;
  return fila.valor.find((c) => c.id === promocion.campanaId) ?? null;
}

/**
 * Las campañas (tal como están en el JSON de la tienda) de varias promociones,
 * por id de promoción. Para la chip "De la campaña {nombre}" de Cupones (A8).
 * @returns {Promise<Map<string, object>>}
 */
export async function campanasDePromociones(db, tiendaId, promocionIds) {
  if (!promocionIds.length) return new Map();
  const [promociones, fila] = await Promise.all([
    db.campana_promociones.findMany({ where: { tiendaId, id: { in: promocionIds } }, select: { id: true, campanaId: true } }),
    db.tienda_configuraciones.findFirst({
      where: { tiendaId, categoria: DISENO_CATEGORIA, clave: "campanas" },
      select: { valor: true }
    })
  ]);
  const campanas = new Map((Array.isArray(fila?.valor) ? fila.valor : []).map((c) => [c.id, c]));
  return new Map(promociones.filter((p) => campanas.has(p.campanaId)).map((p) => [p.id, campanas.get(p.campanaId)]));
}

/** Confirmaciones de una promoción, de la más antigua a la más nueva (R9.4). */
export function confirmacionesDe(db, tiendaId, promocionId) {
  return db.campana_promocion_confirmaciones.findMany({
    where: { tiendaId, promocionId },
    orderBy: { confirmadoEn: "asc" },
    select: { promocionId: true, promocionVersion: true, ventanaInicio: true, ventanaFin: true, confirmadoPor: true, confirmadoEn: true, detalle: true }
  });
}

/** Árbol de categorías de la tienda (para las subcategorías, Q6). */
export function arbolCategorias(db, tiendaId) {
  return db.categorias.findMany({ where: { tiendaId }, select: { id: true, categoriaPadreId: true, nombre: true } });
}

/**
 * ¿Todas las categorías y productos pedidos son de esta tienda? Cantidad
 * encontrada = cantidad pedida: un id de otra tienda (o inexistente) no cuenta.
 */
export async function idsSonDeLaTienda(db, tiendaId, { categoriaIds = [], productoIds = [] }) {
  const [categorias, productos] = await Promise.all([
    categoriaIds.length ? db.categorias.count({ where: { tiendaId, id: { in: categoriaIds } } }) : 0,
    productoIds.length ? db.productos.count({ where: { tiendaId, id: { in: productoIds } } }) : 0
  ]);
  return categorias === categoriaIds.length && productos === productoIds.length;
}

/** ¿Otro cupón de la tienda (que no es el de esta promoción) ya usa el código? */
export async function codigoCuponOcupado(db, tiendaId, codigo, promocionId) {
  const otro = await db.cupones.findFirst({
    where: { tiendaId, codigo, ...(promocionId ? { NOT: { campanaPromocionId: promocionId } } : {}) },
    select: { id: true }
  });
  return Boolean(otro);
}

/** Upsert del arreglo de campañas (misma fila que el PUT de diseño). */
export function guardarCampanas(tx, tiendaId, campanas, usuario) {
  return tx.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: "campanas" } },
    create: { tiendaId, clave: "campanas", valor: campanas, categoria: DISENO_CATEGORIA, usuarioRegistro: usuario },
    update: { valor: campanas, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
}

/**
 * Reemplaza la promoción de la campaña: la fila (misma id, para que sus
 * confirmaciones sigan ligadas), sus categorías, sus productos y su cupón.
 * @param {{ inicio: Date, fin: Date } | null} ventana - El cupón vale dentro de ella (R4.8).
 * @returns {Promise<string>} id de la promoción.
 */
export async function guardarPromocion(tx, tiendaId, campanaId, promocion, { version, usuario, ventana }) {
  const datos = {
    porcentaje: promocion.porcentaje,
    alcance: promocion.alcance,
    permitirCupones: promocion.permitirCupones,
    permitirEnvioGratis: promocion.permitirEnvioGratis,
    version
  };
  const fila = await tx.campana_promociones.upsert({
    where: { uq_promocion_campana: { tiendaId, campanaId } },
    create: { tiendaId, campanaId, ...datos, usuarioRegistro: usuario },
    update: { ...datos, fechaActualizacion: new Date(), usuarioActualizacion: usuario },
    select: { id: true }
  });
  const promocionId = fila.id;

  await tx.campana_promocion_categorias.deleteMany({ where: { tiendaId, promocionId } });
  await tx.campana_promocion_productos.deleteMany({ where: { tiendaId, promocionId } });
  if (promocion.alcance === "categorias") {
    await tx.campana_promocion_categorias.createMany({
      data: promocion.categoriaIds.map((categoriaId) => ({ promocionId, tiendaId, categoriaId }))
    });
  }
  if (promocion.alcance === "productos") {
    await tx.campana_promocion_productos.createMany({
      data: promocion.productoIds.map((productoId) => ({ promocionId, tiendaId, productoId }))
    });
  }

  if (!promocion.cupon) {
    await tx.cupones.deleteMany({ where: { tiendaId, campanaPromocionId: promocionId } });
  } else {
    const { codigo, tipo, valor, minimoCompra, usoMaximo, usoMaximoPorCliente } = promocion.cupon;
    const cupon = {
      codigo, tipo, valor, minimoCompra, usoMaximo, usoMaximoPorCliente, activo: true,
      fechaInicio: ventana?.inicio ?? null,
      fechaFin: ventana?.fin ?? null
    };
    await tx.cupones.upsert({
      where: { campanaPromocionId: promocionId },
      create: { tiendaId, campanaPromocionId: promocionId, ...cupon },
      update: cupon
    });
  }
  return promocionId;
}

/** Borra la promoción de una o varias campañas (cascada: alcance y cupón; las confirmaciones quedan, R9.4). */
export function borrarPromociones(tx, tiendaId, campanaIds) {
  return tx.campana_promociones.deleteMany({ where: { tiendaId, campanaId: { in: campanaIds } } });
}

/**
 * Registra quién confirmó qué (R9.4). Idempotente: un doble clic en "Sí,
 * aplicar" no duplica la fila (ON CONFLICT DO NOTHING sobre la versión y la ventana).
 */
export function insertarConfirmacion(tx, confirmacion) {
  return tx.campana_promocion_confirmaciones.createMany({ data: [confirmacion], skipDuplicates: true });
}

const CON_STOCK = { OR: [{ stock: { gt: 0 } }, { variantes: { some: { activo: true, stock: { gt: 0 } } } }] };

/** Tope de productos que revisa la confirmación (el mismo del listado por precio). */
export const TOPE_REVISION = 5000;

/**
 * Productos que hoy entran en el alcance y se muestran: activos y con stock
 * (R4.5). `categoriaIds` ya trae las subcategorías.
 */
export function productosDelAlcance(db, tiendaId, { alcance, categoriaIds, productoIds }) {
  const filtro = alcance === "categorias" ? { categoriaId: { in: [...categoriaIds] } }
    : alcance === "productos" ? { id: { in: [...productoIds] } }
    : {};
  return db.productos.findMany({
    where: { tiendaId, activo: true, ...filtro, ...CON_STOCK },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: TOPE_REVISION,
    select: { id: true, nombre: true, categoriaId: true, precioBase: true, precioOferta: true, precioCosto: true }
  });
}

/** Tope de "Seleccionar los N resultados" (A5b). */
export const TOPE_IDS = 2000;

/** Ids de los productos que cumplen la búsqueda del selector (activos o no: R4.5). */
export async function idsDeProductos(db, tiendaId, { search, categoriaId }) {
  const filas = await db.productos.findMany({
    where: {
      tiendaId,
      ...(categoriaId ? { categoriaId } : {}),
      ...(search ? { OR: [{ nombre: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {})
    },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: TOPE_IDS + 1,
    select: { id: true }
  });
  return { ids: filas.slice(0, TOPE_IDS).map((f) => f.id), tope: filas.length > TOPE_IDS };
}

/** Producto con lo que necesitan las guardas del precio regular. */
export function productoParaGuarda(db, productoId) {
  return db.productos.findUnique({
    where: { id: productoId },
    select: { id: true, tiendaId: true, categoriaId: true, precioBase: true, variantes: { select: { id: true, precio: true } } }
  });
}

/** Variante con su producto, para la guarda del PUT de variante. */
export function varianteParaGuarda(db, varianteId) {
  return db.producto_variantes.findUnique({
    where: { id: varianteId },
    select: { id: true, precio: true, producto: { select: { id: true, tiendaId: true, categoriaId: true, precioBase: true } } }
  });
}

/**
 * Tiendas con una promoción confirmada (versión actual) en una campaña activa
 * del preset, cuya ventana aún no termina y, si se da, toca [desde, hasta)
 * (R7.7 de campanas-cuando, T3b.10). Cruza tiendas: sin alcance de tenant.
 */
export async function contarTiendasConPromocionConfirmada(presetId, { desde = null, hasta = null } = {}, ahora = new Date()) {
  const filas = await runUnscoped(() => prisma.$queryRaw`
    SELECT COUNT(DISTINCT c.tienda_id)::int AS total
      FROM campana_promocion_confirmaciones c
      JOIN campana_promociones p ON p.id = c.promocion_id AND p.version = c.promocion_version
      JOIN tienda_configuraciones t ON t.tienda_id = c.tienda_id AND t.categoria = 'diseno' AND t.clave = 'campanas'
     WHERE c.ventana_fin > ${ahora}
       AND (${desde}::timestamptz IS NULL OR (c.ventana_inicio < ${hasta}::timestamptz AND c.ventana_fin > ${desde}::timestamptz))
       AND t.valor @> jsonb_build_array(jsonb_build_object('id', c.campana_id::text, 'presetId', ${presetId}::text, 'activa', true))`);
  return Number(filas?.[0]?.total ?? 0);
}
