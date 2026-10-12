/**
 * Montos por rol (docs/specs/dashboard-por-rubro, decisión 3 y DR4): el viewer
 * recibe solo cantidades. Se aplica una sola vez sobre todo el dashboard, así
 * ningún widget tiene que acordarse del rol.
 */
const ROLES_CON_MONTOS = ["editor", "admin", "owner"];

export const verMontos = (rol) => ROLES_CON_MONTOS.includes(rol);

const esObjeto = (v) => v !== null && typeof v === "object" && !(v instanceof Date);

/** Quita todo lo que tenga formato PEN y toda clave `monto`, a cualquier profundidad. */
function quitar(v) {
  if (Array.isArray(v)) return v.filter((x) => !(esObjeto(x) && x.formato === "PEN")).map(quitar);
  if (!esObjeto(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "monto").map(([k, x]) => [k, quitar(x)]));
}

/** Widgets sin montos. Un kpis que se queda sin indicadores se descarta. */
export function sinMontos(widgets) {
  return quitar(widgets).filter((w) => w.tipo !== "kpis" || w.items.length > 0);
}
