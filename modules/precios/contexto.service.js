import { logger } from "../../config/logger.js";
import { DISENO_CATEGORIA } from "../../services/tienda-diseno.service.js";
import { edicionesParaResolver } from "../campanas/ediciones.service.js";
import { promocionesVigentes, proximoCambioPromociones } from "../campanas/promocion.js";
import { contextoEnCache, guardarContexto } from "./contexto.cache.js";

/**
 * Cargador del contexto de precios (docs/specs/campanas-descuento, impacto
 * "Cargador del contexto"): lo que `precioVigente` necesita además del producto.
 * Lee de la BD; la regla vive en campanas/promocion.js (pura).
 *
 * 1. Camino rápido: si la tienda no tiene promociones (casi todas), una consulta
 *    mínima y `promociones: []`.
 * 2. Si tiene: campañas (una fila de tienda_configuraciones), promociones con sus
 *    categorías y productos, confirmaciones y árbol de categorías; una consulta por
 *    tabla, todas con `tienda_id`. Ediciones de la plataforma con su caché de 60 s.
 * 3. `conCache` solo en la vitrina; cotizar y crear el pedido piden `conCache: false`:
 *    el dinero lo decide una lectura fresca (R5.2, CA-5.8).
 *
 * @param {object} db - Cliente Prisma (transaccional al crear el pedido).
 * @param {string} tiendaId
 * @param {{ ahora?: Date, conCache?: boolean }} [opciones]
 * @returns {Promise<{ ahora: Date, promociones: object[], proximoCambio: Date|null }>}
 *   `proximoCambio`: cuándo puede cambiar qué promociones aplican (para las cachés).
 */
export async function contextoDePrecios(db, tiendaId, { ahora = new Date(), conCache = true } = {}) {
  if (!tiendaId) return { ahora, promociones: [], proximoCambio: null };
  if (conCache) {
    const enCache = contextoEnCache(tiendaId);
    if (enCache) return { ...enCache, ahora };
  }

  if (!conCache) return { ...(await cargar(db, tiendaId, ahora)), ahora };

  // La vitrina nunca se cae por las promociones (mismo criterio que las ediciones):
  // si no se pueden leer, muestra el precio sin ellas y queda en la bitácora. Cobrar
  // sí falla: el dinero no se decide con una lectura a medias.
  let contexto;
  try {
    contexto = await cargar(db, tiendaId, ahora);
  } catch (e) {
    logger.warn(`No se pudieron leer las promociones de ${tiendaId} (${e.message}): la vitrina sigue sin ellas`);
    return { ahora, promociones: [], proximoCambio: null };
  }
  guardarContexto(tiendaId, contexto, ahora);
  return { ...contexto, ahora };
}

async function cargar(db, tiendaId, ahora) {
  const datos = await leerPromociones(db, tiendaId);
  if (!datos) return { promociones: [], proximoCambio: null };
  const { campanas, promociones, confirmaciones, categorias, ediciones } = datos;
  return {
    promociones: promocionesVigentes(campanas, promociones, confirmaciones, categorias, ahora, ediciones),
    proximoCambio: proximoCambioPromociones(campanas, promociones, ahora, ediciones)
  };
}

/**
 * Lo que la tienda tiene guardado sobre promociones, sin decidir nada: campañas
 * (JSON), promociones con sus ids de alcance, confirmaciones, árbol de categorías
 * y ediciones. Null si la tienda no tiene ninguna promoción (camino rápido). Lo
 * reusan el Admin (campanas/promocion.service.js) y las guardas de precio.
 * @param {object} db - Cliente Prisma.
 */
export async function leerPromociones(db, tiendaId) {
  const alguna = await db.campana_promociones.findFirst({ where: { tiendaId }, select: { id: true } });
  if (!alguna) return null;

  const [fila, promociones, categoriasPromo, productosPromo, confirmaciones, categorias, ediciones] = await Promise.all([
    db.tienda_configuraciones.findFirst({
      where: { tiendaId, categoria: DISENO_CATEGORIA, clave: "campanas" },
      select: { valor: true }
    }),
    db.campana_promociones.findMany({
      where: { tiendaId },
      select: { id: true, campanaId: true, porcentaje: true, alcance: true, permitirCupones: true, permitirEnvioGratis: true, version: true }
    }),
    db.campana_promocion_categorias.findMany({ where: { tiendaId }, select: { promocionId: true, categoriaId: true } }),
    db.campana_promocion_productos.findMany({ where: { tiendaId }, select: { promocionId: true, productoId: true } }),
    db.campana_promocion_confirmaciones.findMany({
      where: { tiendaId, promocionId: { not: null } },
      select: { promocionId: true, promocionVersion: true, ventanaInicio: true, ventanaFin: true, confirmadoPor: true, confirmadoEn: true }
    }),
    db.categorias.findMany({ where: { tiendaId }, select: { id: true, categoriaPadreId: true, nombre: true } }),
    edicionesParaResolver()
  ]);

  const idsDe = (filas, campo, promocionId) => filas.filter((f) => f.promocionId === promocionId).map((f) => f[campo]);
  return {
    campanas: Array.isArray(fila?.valor) ? fila.valor : [],
    promociones: promociones.map((p) => ({
      ...p,
      categoriaIds: idsDe(categoriasPromo, "categoriaId", p.id),
      productoIds: idsDe(productosPromo, "productoId", p.id)
    })),
    confirmaciones,
    categorias,
    ediciones
  };
}
