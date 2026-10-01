import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { calendarioAnual, disenoPublico } from "./resolver.js";
import { inicioDiaLima, parsearFecha } from "./calendario.js";

/** Calendario de campañas de la tienda para un año (T3.3). */
export async function getCalendario(tiendaId, anio) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { rubro: true } });
  if (!tienda) throw new NotFoundError("Tienda no encontrada");

  const { campanas } = await getDiseno(tiendaId);
  return { anio, rubro: tienda.rubro ?? null, campanas: calendarioAnual(campanas, tienda.rubro, anio) };
}

/**
 * Diseño como lo vería el storefront ese día (R6.1), al mediodía de Lima:
 * lejos de los límites de ventana (que caen a las 00:00).
 * `fecha` llega validada como "YYYY-MM-DD".
 */
export async function getVistaPrevia(tiendaId, fecha) {
  const diseno = await getDiseno(tiendaId);
  const mediodia = new Date(inicioDiaLima(parsearFecha(fecha)).getTime() + 12 * 3_600_000);
  return { fecha, ...disenoPublico(diseno, mediodia) };
}
