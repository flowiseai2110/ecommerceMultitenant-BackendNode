/**
 * Piezas del dashboard del admin (docs/specs/dashboard-por-rubro).
 *
 * El dashboard de un rubro es una lista de widgets (negocio/<rubro>/dashboard.js).
 * Cada widget es una función `(ctx) => Promise<Widget | null>`: null = no aplica
 * a esta tienda (p. ej. el mapa de habitaciones de un hotel sin Recepción).
 * El front tiene un componente por cada tipo: un tipo nuevo se agrega en los dos repos.
 */
export const TIPOS_WIDGET = Object.freeze([
  "atencion", "kpis", "barras", "ranking", "lista", "habitaciones",
  "funciones", "calendario", "embudo", "agenda", "mapa_calor"
]);

/** PEN es lo único que el rol viewer no recibe (ver montos.js). */
export const FORMATOS = Object.freeze(["PEN", "num", "pct", "horas", "texto"]);

export const ANCHOS = Object.freeze(["completo", "ancho", "medio", "angosto"]);

/** Indicador de una fila de kpis. `anterior`: el mismo indicador en los 30 días previos. */
export const kpi = (clave, etiqueta, valor, formato = "num", extra = {}) => ({ clave, etiqueta, valor, formato, ...extra });

/** Contador de la franja «Requiere atención»: `contar(ctx)` devuelve el número. */
export const contador = (clave, etiqueta, tono, ruta, contar, query = null) =>
  async (ctx) => ({ clave, etiqueta, tono, ruta, ...(query ? { query } : {}), n: await contar(ctx) });

/** Franja «Requiere atención»: solo lo que tiene algo pendiente. */
export const atencion = (contadores) => async (ctx) => {
  const items = await Promise.all(contadores.map((c) => c(ctx)));
  return { tipo: "atencion", id: "atencion", ancho: "completo", items: items.filter((i) => i.n > 0) };
};

/** Fila de indicadores. Cada medidor devuelve un kpi() o null (no aplica). */
export const kpis = (id, titulo, medidores) => async (ctx) => {
  const items = (await Promise.all(medidores.map((m) => m(ctx)))).filter(Boolean);
  return items.length ? { tipo: "kpis", id, titulo, ancho: "completo", items } : null;
};

/** % redondeado; 0 si no hay base. */
export const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export const redondear2 = (n) => Math.round(n * 100) / 100;
