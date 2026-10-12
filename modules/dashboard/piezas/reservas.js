import { contarPestana } from "../../reservas/reservas.service.js";
import { contador, kpi, redondear2 } from "../widgets.js";
import { serieDelPeriodo, sumarPorPeriodo } from "../periodo.js";
import { cobrosDe } from "./cobros.js";

/**
 * Piezas que comparten los rubros de reservas. La bandeja (/reservas) es la
 * misma para todos: los contadores abren su pestaña.
 */
const pestana = (clave, etiqueta, tono) =>
  contador(clave, etiqueta, tono, "/reservas", (ctx) => contarPestana(ctx.tiendaId, clave, ctx.ahora), { pestana: clave });

export const porResponder = pestana("por_responder", "Solicitudes por responder", "warn");
export const pagoPorVerificar = pestana("pago_por_verificar", "Pagos por verificar", "warn");
export const cuotasVencidas = pestana("cuotas_vencidas", "Cuotas vencidas", "crit");
export const garantias = pestana("garantias", "Garantías por devolver", "info");

/** Ingresos del periodo: lo cobrado (DR6). */
export const ingresos = (etiqueta = "Ingresos", { mostrador = false, destacado = true } = {}) => async (ctx) => {
  const { valor, anterior } = sumarPorPeriodo(ctx.periodo, await cobrosDe(ctx, { mostrador }));
  return kpi("ingresos", etiqueta, redondear2(valor), "PEN", { anterior: redondear2(anterior), destacado });
};

/** Lo cobrado por día en los 30 días. */
export const ingresosPorDia = ({ mostrador = false, titulo = "Ingresos por día" } = {}) => async (ctx) => ({
  tipo: "barras", id: "ingresos_dia", titulo, subtitulo: "Pagos verificados", ancho: "completo", formato: "PEN",
  serie: serieDelPeriodo(ctx.periodo, await cobrosDe(ctx, { mostrador }))
});
