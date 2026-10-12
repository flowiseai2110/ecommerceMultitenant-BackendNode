import { estrategiaDe, tiendaDe } from "../negocio/registro.js";
import { ultimos30 } from "./periodo.js";
import { sinMontos, verMontos } from "./montos.js";

/**
 * Dashboard del admin (docs/specs/dashboard-por-rubro). No sabe de rubros: corre
 * en paralelo los widgets que declara la estrategia de la tienda, descarta los que
 * no aplican y quita los montos si el rol no los ve (DR3).
 *
 * `ctx.memo(clave, fn)` comparte una consulta entre widgets del mismo request
 * (p. ej. los cobros por día los usan el kpi de ingresos y el gráfico).
 *
 * @param {string} tiendaId
 * @param {{ rol: string, ahora?: Date }} opciones
 */
export async function armarDashboard(tiendaId, { rol, ahora = new Date() }) {
  const tienda = await tiendaDe(tiendaId);
  const periodo = ultimos30(ahora);
  const consultas = new Map();
  const memo = (clave, fn) => {
    if (!consultas.has(clave)) consultas.set(clave, fn());
    return consultas.get(clave);
  };
  const ctx = { tiendaId, tienda, periodo, ahora, memo };

  const widgets = (await Promise.all(estrategiaDe(tienda).dashboard.map((w) => w(ctx)))).filter(Boolean);
  const montos = verMontos(rol);
  return {
    periodo: { desde: periodo.desde, hasta: periodo.hasta, dias: periodo.dias },
    montos,
    widgets: montos ? widgets : sinMontos(widgets)
  };
}
