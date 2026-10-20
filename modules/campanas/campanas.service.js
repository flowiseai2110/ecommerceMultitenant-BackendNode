import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { calendarioAnual, disenoPublico } from "./resolver.js";
import { CAMPANA_PRESETS } from "./presets.js";
import { EFECTOS } from "./efectos.js";
import { horaAMs, inicioDiaLima, parsearFecha } from "./calendario.js";
import { datosDe } from "../negocio/datos.js";
import { edicionesParaResolver } from "./ediciones.service.js";

/**
 * Calendario de campañas de la tienda para un año (T3.3), con el catálogo
 * de presets: el editor del admin muestra sus textos, paleta y widgets como
 * valores por defecto de lo que la tienda no personalizó.
 */
export async function getCalendario(tiendaId, anio) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { rubro: true, tipoNegocio: true } });
  if (!tienda) throw new NotFoundError("Tienda no encontrada");

  const [{ campanas }, ediciones] = await Promise.all([getDiseno(tiendaId), edicionesParaResolver()]);
  return { anio, rubro: tienda.rubro ?? null, presets: CAMPANA_PRESETS, efectos: EFECTOS, campanas: calendarioAnual(campanas, tienda.rubro, anio, ediciones, datosDe(tienda.tipoNegocio).recibeReservas) };
}

/**
 * Diseño como lo vería el storefront ese día (R6.1) a la `hora` pedida
 * (R3.11) o, sin ella, al mediodía de Lima: lejos de los límites de ventana
 * que caen a las 00:00. `fecha` ("YYYY-MM-DD") y `hora` ("HH:mm") llegan validadas.
 */
export async function getVistaPrevia(tiendaId, fecha, hora) {
  const [diseno, tienda, ediciones] = await Promise.all([
    getDiseno(tiendaId),
    prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } }),
    edicionesParaResolver()
  ]);
  const momento = new Date(inicioDiaLima(parsearFecha(fecha)).getTime() + (horaAMs(hora) ?? 12 * 3_600_000));
  return { fecha, ...(hora ? { hora } : {}), ...disenoPublico(diseno, momento, tienda?.tipoNegocio, ediciones) };
}
