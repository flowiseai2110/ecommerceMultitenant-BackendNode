import http from "k6/http";
import { group } from "k6";
import { BASE_URL, HEADERS, PREFIJO, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } from "./config.js";
import { datos, elegir, lote, pensar, prob, qs, verificar } from "./util.js";

/**
 * Login como lo hace el Admin (Supabase Auth, email + contraseña) con el
 * usuario de pruebas que scripts/seed-carga.js deja como owner de las tiendas.
 * El JWT dura 1 h: suficiente para una corrida.
 * @returns {string} access_token
 */
export function login() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Faltan SUPABASE_URL, SUPABASE_ANON_KEY, K6_ADMIN_EMAIL o K6_ADMIN_PASSWORD (load-tests/.env.local)");
  }
  const r = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, tags: { name: "setup:login" } }
  );
  const token = r.status === 200 ? r.json("access_token") : null;
  if (!token) throw new Error(`Login falló (${r.status}): ${r.body}`);
  return token;
}

const opciones = (token, nombre) => ({
  headers: { ...HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  tags: { name: nombre, tipo: "admin" }
});
const req = (token, nombre, ruta, params = {}) => ["GET", `${BASE_URL}${ruta}?${qs(params)}`, null, opciones(token, nombre)];

/** Tiendas de carga del owner de pruebas (las reales no se tocan). */
export function tiendasDelOwner(token) {
  const r = http.get(`${BASE_URL}/admin/tiendas?${qs({ page: 1, limit: 100 })}`, opciones(token, "setup:admin-tiendas"));
  const tiendas = datos(r).filter(t => t.slug?.startsWith(`${PREFIJO}-`)).map(t => ({ id: t.id, slug: t.slug }));
  if (!tiendas.length) throw new Error(`El owner de pruebas no tiene tiendas "${PREFIJO}-NNN": corre seed-carga con --owner-email`);
  return tiendas;
}

/**
 * Sesión de un administrador: dashboard → pedidos → detalle de pedido →
 * productos → ficha → (30 %) edita la descripción corta de un producto activo.
 */
export function sesion(token, t) {
  group("admin:dashboard", () => {
    lote([req(token, "admin:perfil", "/admin/users/me/profile")], { formato: false }); // envelope propio
    lote([
      req(token, "admin:stats", `/admin/tiendas/${t.id}/stats`, { tiendaId: t.id }),
      req(token, "admin:pendientes", "/admin/pedidos/pendientes/count", { tiendaId: t.id })
    ]);
  });
  pensar(5, 12);

  let pedidos = [];
  group("admin:pedidos", () => {
    const [r] = lote([req(token, "admin:pedidos-lista", "/admin/pedidos/lista", { tiendaId: t.id, page: 1, limit: 20, orderBy: "fechaRegistro:desc" })]);
    pedidos = datos(r);
  });
  pensar(4, 10);

  if (pedidos.length) {
    group("admin:pedido-detalle", () => {
      lote([req(token, "admin:pedido", `/admin/pedidos/${elegir(pedidos).id}`, { tiendaId: t.id })]);
    });
    pensar(5, 15);
  }

  let productos = [];
  group("admin:productos", () => {
    const [r] = lote([req(token, "admin:productos-lista", "/admin/productos", { tiendaId: t.id, page: 1, limit: 20 })]);
    productos = datos(r).filter(p => p.activo);
  });
  pensar(4, 10);

  if (!productos.length) return;
  const p = elegir(productos);
  group("admin:producto-detalle", () => {
    lote([req(token, "admin:producto", `/admin/productos/${p.id}`, { tiendaId: t.id })]);
  });

  if (prob(0.3)) {
    pensar(10, 25); // editando el formulario
    group("admin:producto-editar", () => {
      // Solo descripcionCorta: no altera stock, precio ni estado del catálogo de prueba.
      const body = JSON.stringify({ descripcionCorta: `Editado por prueba de carga ${new Date().toISOString()}` });
      verificar(http.put(`${BASE_URL}/admin/productos/${p.id}`, body, opciones(token, "admin:producto-editar")), "admin:producto-editar");
    });
  }
}

/** Nombres de los endpoints de la sesión (para el p95 por endpoint del resumen). */
export const ENDPOINTS_ADMIN = [
  "admin:perfil", "admin:stats", "admin:pendientes", "admin:pedidos-lista", "admin:pedido",
  "admin:productos-lista", "admin:producto", "admin:producto-editar"
];
