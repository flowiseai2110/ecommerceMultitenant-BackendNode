import { group } from "k6";
import { BASE_URL, HEADERS, SIN_CDN } from "./config.js";
import { datos, elegir, lote, pensar, prob, qs } from "./util.js";

/**
 * Páginas del storefront, con las MISMAS llamadas y parámetros que hace el
 * Angular del Store (features/ y core/services del FrontendStore). Las llamadas
 * de una página van en paralelo (http.batch), como en el navegador.
 *
 * Diferencias con un navegador real: k6 no usa la caché HTTP del navegador
 * (cada visita vuelve a pedir todo), pero sí pasa por el CDN de Railway salvo
 * con CDN=no (ver config.js).
 */

// /store/tiendas valida su query en modo estricto (400 con parámetros extra):
// en modo CDN=no queda fuera del rompe-caché (1 request por visita, con caché en memoria).
const rompeCache = (ruta) => (SIN_CDN && ruta !== "/store/tiendas" ? { _k6: Math.random().toString(36).slice(2, 10) } : {});

const req = (nombre, ruta, params) => ["GET", `${BASE_URL}${ruta}?${qs({ ...params, ...rompeCache(ruta) })}`, null, { headers: HEADERS, tags: { name: nombre, tipo: "store" } }];

/** Portada: tienda, categorías, aviso de live, métodos de pago, productos de inicio, reseñas destacadas. */
export function portada(t) {
  group("portada", () => {
    lote([
      req("store:tienda", "/store/tiendas", { slug: t.slug }),
      req("store:categorias", "/store/categorias", { tiendaId: t.id, orderBy: "orden:asc" }),
      req("store:live", "/store/live", { tiendaId: t.id }),
      req("store:metodos-pago", "/store/metodos-pago", { tiendaId: t.id, activo: "true" }),
      req("store:productos-home", "/store/productos/home", { tiendaId: t.id, limit: 8 }),
      req("store:resenas-destacadas", "/store/resenas/destacadas", { tiendaId: t.id, limit: 6 })
    ]);
  });
}

const listado = (t, extra) => req("store:productos-lista", "/store/productos", {
  tiendaId: t.id, activo: "true", page: 1, limit: 12, orderBy: "fechaRegistro:desc", ...extra
});

/** Página de categoría: la categoría por slug, su listado y el rango de precios del filtro. */
export function categoria(t) {
  if (!t.categorias.length) return;
  const c = elegir(t.categorias);
  group("categoria", () => {
    lote([
      req("store:categoria-slug", "/store/categorias", { tiendaId: t.id, slug: c.slug }),
      listado(t, { categoriaId: c.id }),
      req("store:precio-min", "/store/productos", { tiendaId: t.id, activo: "true", limit: 1, orderBy: "precioBase:asc" }),
      req("store:precio-max", "/store/productos", { tiendaId: t.id, activo: "true", limit: 1, orderBy: "precioBase:desc" })
    ]);
    if (prob(0.3)) {
      pensar(3, 8);
      lote([listado(t, { categoriaId: c.id, page: 2 })]);
    }
  });
}

/** Ficha de producto: por slug, y luego sus reseñas y relacionados (dependen del id y la categoría). */
export function producto(t) {
  if (!t.productos.length) return;
  const p = elegir(t.productos);
  group("producto", () => {
    const [r] = lote([req("store:producto-slug", "/store/productos", { tiendaId: t.id, slug: p.slug })]);
    if (r.status !== 200) return;
    const ficha = datos(r)[0] ?? p;
    lote([
      req("store:resenas-producto", `/store/resenas/producto/${ficha.id}`, { tiendaId: t.id, page: 1, limit: 5 }),
      req("store:relacionados", "/store/productos", { tiendaId: t.id, categoriaId: ficha.categoriaId, activo: "true", limit: 4 })
    ]);
  });
}

/** Búsqueda por texto (ILIKE en la BD: de las consultas más caras del catálogo). */
export function busqueda(t) {
  if (!t.productos.length) return;
  const termino = elegir(t.productos).nombre.split(" ")[0];
  group("busqueda", () => {
    lote([listado(t, { search: termino })]);
  });
}

/** Checkout (vista): métodos de pago y de envío activos. */
export function checkoutVista(t) {
  group("checkout-vista", () => {
    lote([
      req("store:metodos-pago", "/store/metodos-pago", { tiendaId: t.id, activo: "true" }),
      req("store:metodos-envio", "/store/metodos-envio", { tiendaId: t.id, activo: "true" })
    ]);
  });
}

/**
 * Visita completa de un comprador, con pausas de lectura entre páginas:
 * portada → categoría (70 %) → producto (60 %) → otro producto (30 %) →
 * búsqueda (20 %) → checkout (15 %).
 */
export function visita(t) {
  portada(t);
  pensar(3, 8);
  if (prob(0.7)) { categoria(t); pensar(4, 10); }
  if (prob(0.6)) { producto(t); pensar(5, 15); }
  if (prob(0.3)) { producto(t); pensar(5, 12); }
  if (prob(0.2)) { busqueda(t); pensar(3, 8); }
  if (prob(0.15)) checkoutVista(t);
}

/** Nombres de los endpoints del recorrido (para el p95 por endpoint del resumen). */
export const ENDPOINTS_STORE = [
  "store:tienda", "store:categorias", "store:live", "store:metodos-pago", "store:productos-home",
  "store:resenas-destacadas", "store:categoria-slug", "store:productos-lista", "store:precio-min",
  "store:precio-max", "store:producto-slug", "store:resenas-producto", "store:relacionados", "store:metodos-envio"
];
