import { atencion, kpis } from "../../dashboard/widgets.js";
import { ingresos, pagoPorVerificar, porResponder } from "../../dashboard/piezas/reservas.js";
import {
  pasajeros, pasajerosProximos14, proximasSalidas, salenSinConfirmar, tasaAceptacion, tiempoRespuesta, toursMasVendidos
} from "../../reservas/tours/dashboard.js";

/** Dashboard de la agencia de tours (docs/specs/dashboard-por-rubro): responder rápido y saber qué sale. */
export const dashboardTours = Object.freeze([
  atencion([porResponder, pagoPorVerificar, salenSinConfirmar]),
  kpis("periodo", "Últimos 30 días", [ingresos(), pasajeros, tasaAceptacion, tiempoRespuesta]),
  proximasSalidas,
  toursMasVendidos,
  pasajerosProximos14
]);
