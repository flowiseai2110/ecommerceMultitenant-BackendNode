import { Prisma } from "../../config/prisma.js";

/**
 * Qué productos se pueden mostrar en la tienda (listado, home, detalle, buscador).
 *
 * Un producto en 0 que no es servicio todavía no tiene precio y no se vende: es
 * el tipo de habitación recién creado (el hotel no pide precio en el formulario,
 * modules/negocio/hotel), que pasa a servicio con su precio "desde" al guardar la
 * estadía. Productos y tours exigen precio > 0; eventos y locales sin precio ya
 * son servicio, así que no les afecta.
 */
export const CON_PRECIO_WHERE = { OR: [{ precioBase: { gt: 0 } }, { esServicio: true }] };

/** Lo mismo para las consultas SQL (alias `p` = productos). Función: Prisma.sql se arma al usarse. */
export const conPrecioSql = () => Prisma.sql`(p.precio_base > 0 OR p.es_servicio)`;
