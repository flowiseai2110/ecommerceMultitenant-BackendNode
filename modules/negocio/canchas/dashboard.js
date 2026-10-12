import { atencion, kpis } from "../../dashboard/widgets.js";
import { ingresos, pagoPorVerificar } from "../../dashboard/piezas/reservas.js";
import {
  agendaHoy, apartados, bloqueosHoy, clientesQueRepiten, horasLibresNoche, horasVendidas, ingresosHoy, mapaDeCalor,
  ocupacionHoy, ocupacionPeriodo, proximoTurno
} from "../../reservas/canchas/dashboard.js";

/** Dashboard del complejo de canchas (docs/specs/dashboard-por-rubro): la agenda de hoy y qué horas se llenan. */
export const dashboardCanchas = Object.freeze([
  atencion([pagoPorVerificar, apartados, bloqueosHoy]),
  kpis("hoy", "Hoy", [ocupacionHoy, ingresosHoy, proximoTurno, horasLibresNoche]),
  agendaHoy,
  kpis("periodo", "Últimos 30 días", [ingresos("Ingresos", { destacado: false }), ocupacionPeriodo, horasVendidas, clientesQueRepiten]),
  mapaDeCalor
]);
