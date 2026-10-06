import http from "k6/http";
import { BASE_URL, HEADERS, PREFIJO } from "./config.js";
import { datos, qs } from "./util.js";

const get = (ruta, params) => http.get(`${BASE_URL}${ruta}?${qs(params)}`, { headers: HEADERS, tags: { name: `setup:${ruta}` } });

/**
 * Datos de las tiendas sembradas por scripts/seed-carga.js (carga-001...).
 * Corre una vez en setup(): id, categorías y productos de cada tienda, para
 * que los usuarios virtuales naveguen URLs reales.
 * @param {number} n - Cuántas tiendas cargar.
 * @returns {Array<{id: string, slug: string, categorias: object[], productos: object[]}>}
 */
export function cargarTiendas(n) {
  const tiendas = [];
  for (let i = 1; i <= n; i++) {
    const slug = `${PREFIJO}-${String(i).padStart(3, "0")}`;
    const [tienda] = datos(get("/store/tiendas", { slug }));
    if (!tienda) continue;
    const categorias = datos(get("/store/categorias", { tiendaId: tienda.id, orderBy: "orden:asc" }))
      .map(c => ({ id: c.id, slug: c.slug }));
    const productos = datos(get("/store/productos", { tiendaId: tienda.id, activo: "true", page: 1, limit: 100 }))
      .map(p => ({ id: p.id, slug: p.slug, nombre: p.nombre, categoriaId: p.categoriaId, precio: p.precioOferta ?? p.precioBase }));
    tiendas.push({ id: tienda.id, slug, categorias, productos });
  }
  if (!tiendas.length) {
    throw new Error(`No hay tiendas "${PREFIJO}-NNN" en ${BASE_URL}. Corre primero: npm run seed:carga -- --tiendas N --confirmar-db <ref>`);
  }
  console.log(`setup: ${tiendas.length} tiendas, ${tiendas.reduce((s, t) => s + t.productos.length, 0)} productos`);
  return tiendas;
}
