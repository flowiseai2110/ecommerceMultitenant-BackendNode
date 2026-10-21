// Orden y filtro del catálogo por el precio que se cobra — lógica pura.
// docs/specs/campanas-descuento (R6.1, impacto "Orden y filtro por precio vigente", E4).
//
// "Menor precio" y el rango de precios usan `precioVigente` (la única regla):
// con oferta o promoción, un producto de S/ 100 a S/ 80 se ordena y filtra por 80.
// No hay una segunda implementación en SQL: la ruta trae una proyección liviana
// de todo lo que cumple los demás filtros y aquí se filtra, ordena y pagina.

import { precioVigente, aCentimos } from "../precios/precio-vigente.js";

/** Tope de filas por tienda para ordenar en memoria (las pymes de hoy están muy por debajo). */
export const MAX_FILAS_POR_PRECIO = 5000;

/** Campos de orden y de rango que se leen como precio vigente (los de la Tienda vieja siguen valiendo). */
const CAMPOS_PRECIO = ["precioBase", "precio"];

/**
 * Lo que la petición pide sobre el precio, o null si no ordena ni filtra por él.
 * @param {object} query - Query del listado (`orderBy`, `min_precioBase`, `max_precio`…).
 * @returns {{ direccion: "asc"|"desc"|null, min: number|null, max: number|null } | null}
 */
export function pedidoPorPrecio(query = {}) {
  const [campo, dir = "asc"] = String(query.orderBy ?? "").split(":");
  const direccion = CAMPOS_PRECIO.includes(campo) ? (dir.toLowerCase() === "desc" ? "desc" : "asc") : null;
  const numero = (prefijo) => {
    for (const c of CAMPOS_PRECIO) {
      const v = query[`${prefijo}_${c}`];
      if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const min = numero("min");
  const max = numero("max");
  return direccion || min !== null || max !== null ? { direccion, min, max } : null;
}

/** La query sin lo que se resuelve aquí (orden, rango y paginación por precio). */
export function sinPrecio(query = {}) {
  const resto = { ...query };
  for (const c of CAMPOS_PRECIO) {
    delete resto[`min_${c}`];
    delete resto[`max_${c}`];
  }
  if (CAMPOS_PRECIO.includes(String(resto.orderBy ?? "").split(":")[0])) delete resto.orderBy;
  delete resto.page;
  delete resto.limit;
  return resto;
}

/**
 * Filtra por rango, ordena por precio vigente (desempate por `id`, para que el
 * scroll infinito no repita ni salte filas) y pagina.
 *
 * @param {Array<{ id: string, categoriaId?: string|null, precioBase: any, precioOferta?: any }>} filas
 * @param {{ direccion: "asc"|"desc"|null, min: number|null, max: number|null }} pedido - En soles.
 * @param {{ promociones?: object[] }} contexto
 * @param {{ page: number, limit: number }} pagina
 * @returns {{ ids: string[], total: number }} ids de la página, en orden
 */
export function ordenarPorPrecio(filas, pedido, contexto, { page, limit }) {
  const min = pedido.min === null ? null : aCentimos(pedido.min);
  const max = pedido.max === null ? null : aCentimos(pedido.max);

  const conPrecio = filas
    .map((f) => ({ id: f.id, unitario: precioVigente(f, null, contexto).unitario }))
    .filter((f) => (min === null || f.unitario >= min) && (max === null || f.unitario <= max));

  if (pedido.direccion) {
    const signo = pedido.direccion === "desc" ? -1 : 1;
    conPrecio.sort((a, b) => signo * (a.unitario - b.unitario) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const desde = (page - 1) * limit;
  return { ids: conPrecio.slice(desde, desde + limit).map((f) => f.id), total: conPrecio.length };
}
