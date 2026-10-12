import { atencion, kpis } from "../../dashboard/widgets.js";
import { ingresos, pagoPorVerificar } from "../../dashboard/piezas/reservas.js";
import {
  apartadasSinPagar, entradasPorDia, entradasVendidas, ingresoPorEntrada, proximasFunciones, vendidasHoy
} from "../../reservas/eventos/dashboard.js";

/**
 * Dashboard de eventos (docs/specs/dashboard-por-rubro): vender el aforo antes
 * de la función. Pendiente (fase 2): saldo de minutos de transmisión.
 */
export const dashboardEventos = Object.freeze([
  atencion([pagoPorVerificar, apartadasSinPagar]),
  kpis("periodo", "Últimos 30 días", [entradasVendidas, ingresos("Ingresos", { destacado: false }), vendidasHoy, ingresoPorEntrada]),
  proximasFunciones,
  entradasPorDia
]);
