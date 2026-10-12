import { atencion, kpis } from "../../dashboard/widgets.js";
import { ingresos, pagoPorVerificar, porResponder } from "../../dashboard/piezas/reservas.js";
import {
  enCasa, listaLlegadas, llegadas, mapaHabitaciones, nochesVendidas, ocupacionNoche, ocupacionPromedio,
  ocupacionProximos14, porLimpiar, salidas, salidasVencidas, tarifaPromedio
} from "../../reservas/hotel/dashboard.js";

/** Dashboard del hotel (docs/specs/dashboard-por-rubro): la noche de hoy primero. */
export const dashboardHotel = Object.freeze([
  atencion([porResponder, pagoPorVerificar, porLimpiar, salidasVencidas]),
  kpis("hoy", "Hoy", [ocupacionNoche, llegadas, salidas, enCasa]),
  mapaHabitaciones,
  listaLlegadas,
  // Ingresos: web + mostrador (hotel_cobros).
  kpis("periodo", "Últimos 30 días", [ingresos("Ingresos", { mostrador: true }), ocupacionPromedio, tarifaPromedio, nochesVendidas]),
  ocupacionProximos14
]);
