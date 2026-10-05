import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { calendarioAnual, disenoPublico } from "./resolver.js";
import { CAMPANA_PRESETS } from "./presets.js";
import { inicioDiaLima, parsearFecha } from "./calendario.js";

/**
 * Calendario de campañas de la tienda para un año (T3.3), con el catálogo
 * de presets: el editor del admin muestra sus textos, paleta y widgets como
 * valores por defecto de lo que la tienda no personalizó.
 */
export async function getCalendario(tiendaId, anio) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { rubro: true } });
  if (!tienda) throw new NotFoundError("Tienda no encontrada");

  const { campanas } = await getDiseno(tiendaId);
  return { anio, rubro: tienda.rubro ?? null, presets: CAMPANA_PRESETS, campanas: calendarioAnual(campanas, tienda.rubro, anio) };
}

/**
 * Diseño como lo vería el storefront ese día (R6.1), al mediodía de Lima:
 * lejos de los límites de ventana (que caen a las 00:00).
 * `fecha` llega validada como "YYYY-MM-DD".
 */
export async function getVistaPrevia(tiendaId, fecha) {
  const [diseno, tienda] = await Promise.all([
    getDiseno(tiendaId),
    prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } })
  ]);
  const mediodia = new Date(inicioDiaLima(parsearFecha(fecha)).getTime() + 12 * 3_600_000);
  return { fecha, ...disenoPublico(diseno, mediodia, tienda?.tipoNegocio) };
}
