// Recorridos que imitan lo que hacen el Store y el Admin. Las peticiones y sus
// parámetros salen de los servicios de cada frontend (store.service.ts,
// home.service.ts, catalog.service.ts, product.service.ts, pedidos.service.ts…).

import { group } from "k6";
import { get, datos, elegir, pausa } from "./comun.js";

const PALABRAS_BUSQUEDA = ["negro", "blanco", "deportivas", "algodón", "pack", "premium", "azul"];
const ORDENES = ["fechaRegistro:desc", "precioBase:asc", "precioBase:desc", "nombre:asc"];

/** Un visitante del Store: portada → catálogo → 1-3 productos → a veces prepara el checkout. */
export function visitaStore(tienda) {
  const s = { tipo: "store" };
  const tiendaId = tienda.id;

  group("store: portada", () => {
    get("/store/tiendas", { slug: tienda.slug }, { ...s, nombre: "store/tiendas?slug" });
    get("/store/categorias", { tiendaId, orderBy: "orden:asc" }, { ...s, nombre: "store/categorias" });
    get("/store/productos/home", { tiendaId, limit: 8 }, { ...s, nombre: "store/productos/home" });
    get("/store/live", { tiendaId }, { ...s, nombre: "store/live" });
    get("/store/resenas/destacadas", { tiendaId, limit: 6 }, { ...s, nombre: "store/resenas/destacadas" });
  });
  pausa(2, 6);

  group("store: catálogo", () => {
    const filtros = { tiendaId, activo: "true", page: 1, limit: 12, orderBy: elegir(ORDENES) };
    if (Math.random() < 0.5) filtros.categoriaId = elegir(tienda.categorias).id;
    if (Math.random() < 0.2) filtros.search = elegir(PALABRAS_BUSQUEDA);
    get("/store/productos", filtros, { ...s, nombre: "store/productos (listado)" });

    // Rango de precios del filtro lateral (catalog.service.ts).
    const base = { tiendaId, activo: "true", limit: 1 };
    get("/store/productos", { ...base, orderBy: "precioBase:asc" }, { ...s, nombre: "store/productos (precio min)" });
    get("/store/productos", { ...base, orderBy: "precioBase:desc" }, { ...s, nombre: "store/productos (precio max)" });

    if (Math.random() < 0.4) {
      pausa(1, 4);
      get("/store/productos", { ...filtros, page: 2 }, { ...s, nombre: "store/productos (listado)" });
    }
  });
  pausa(2, 6);

  const vistos = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < vistos; i++) {
    group("store: producto", () => {
      const productoId = elegir(tienda.productos);
      const producto = datos(get(`/store/productos/${productoId}`, null, { ...s, nombre: "store/productos/:id" }));
      get(`/store/resenas/producto/${productoId}`, { tiendaId, page: 1, limit: 5 }, { ...s, nombre: "store/resenas/producto/:id" });
      const categoriaId = producto?.categoriaId || elegir(tienda.categorias).id;
      get("/store/productos", { tiendaId, categoriaId, activo: "true", limit: 4 }, { ...s, nombre: "store/productos (relacionados)" });
    });
    pausa(3, 8);
  }

  if (Math.random() < 0.3) {
    group("store: checkout", () => {
      get("/store/metodos-pago", { tiendaId }, { ...s, nombre: "store/metodos-pago" });
      get("/store/metodos-envio", { tiendaId }, { ...s, nombre: "store/metodos-envio" });
      get("/store/envios/cotizar", { tiendaId, subtotal: 120 + Math.floor(Math.random() * 200) }, { ...s, nombre: "store/envios/cotizar" });
    });
    pausa(2, 5);
  }
}

/** Una sesión del Admin, solo lectura: dashboard → pedidos → productos → reseñas. */
export function sesionAdmin(tienda, token) {
  const a = { tipo: "admin", token };
  const tiendaId = tienda.id;

  group("admin: dashboard", () => {
    get(`/admin/tiendas/${tiendaId}/stats`, null, { ...a, nombre: "admin/tiendas/:id/stats" });
    get("/admin/pedidos/resumen", { tiendaId, page: 1, limit: 5 }, { ...a, nombre: "admin/pedidos/resumen" });
    get("/admin/pedidos/pendientes/count", { tiendaId }, { ...a, nombre: "admin/pedidos/pendientes/count" });
  });
  pausa(3, 8);

  group("admin: pedidos", () => {
    const filtros = { tiendaId, page: 1, limit: 10 };
    if (Math.random() < 0.5) filtros.estado = elegir(["pendiente", "confirmado", "enviado", "entregado"]);
    get("/admin/pedidos/lista", filtros, { ...a, nombre: "admin/pedidos/lista" });
    if (tienda.pedidos?.length) {
      pausa(2, 5);
      get(`/admin/pedidos/${elegir(tienda.pedidos)}`, { tiendaId }, { ...a, nombre: "admin/pedidos/:id" });
    }
  });
  pausa(3, 8);

  group("admin: productos", () => {
    get("/admin/productos", { tiendaId, page: 1, limit: 10 }, { ...a, nombre: "admin/productos" });
    pausa(2, 5);
    get(`/admin/productos/${elegir(tienda.productos)}`, { tiendaId }, { ...a, nombre: "admin/productos/:id" });
  });
  pausa(3, 8);

  group("admin: reseñas", () => {
    get("/admin/resenas", { tiendaId, page: 1, limit: 20 }, { ...a, nombre: "admin/resenas" });
  });
  pausa(3, 8);
}
