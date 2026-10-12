import { atencion, kpis } from "../../dashboard/widgets.js";
import { cuotasVencidas, garantias, ingresos, pagoPorVerificar, porResponder } from "../../dashboard/piezas/reservas.js";
import {
  calendarioDelMes, canalDeOrigen, conversionCotizaciones, cotizacionesPorVencer, cuotasDeLaSemana, embudo, eventosProximos, porCobrar
} from "../../reservas/locales/dashboard.js";

/** Dashboard del local de eventos (docs/specs/dashboard-por-rubro): fechas, conversión y cobranza. */
export const dashboardLocales = Object.freeze([
  atencion([porResponder, pagoPorVerificar, cuotasVencidas, garantias, cotizacionesPorVencer]),
  kpis("periodo", "Últimos 30 días", [ingresos("Cobrado"), porCobrar, eventosProximos, conversionCotizaciones]),
  calendarioDelMes,
  embudo,
  cuotasDeLaSemana,
  canalDeOrigen
]);
