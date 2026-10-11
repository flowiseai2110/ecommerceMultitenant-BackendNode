import { productos } from "./productos/estrategia.js";
import { hotel } from "./hotel/estrategia.js";
import { verticalHotel } from "../reservas/hotel/vertical.js";
import { verticalTours } from "../reservas/tours/vertical.js";
import { verticalEventos } from "../reservas/eventos/vertical.js";
import { verticalLocal } from "../reservas/locales/locales.service.js";
import { agenteHotel } from "../agente/perfiles/hotel.js";
import { agenteTours } from "../agente/perfiles/tours.js";
import { agenteEventos } from "../agente/perfiles/eventos.js";
import { agenteLocales } from "../agente/perfiles/locales.js";
import { DATOS } from "./datos.js";

export { tiendaDe, invalidarRubrosCache } from "./rubros.cache.js";

/**
 * Registro de estrategias por rubro (docs/specs/perfil-negocio).
 *
 * El rubro sale de la base (tiendas.tipo_negocio, ver tiendaDe), nunca del
 * request: un `tipoNegocio` enviado por el cliente permitiría saltarse reglas
 * (p. ej. crear un producto sin precio en una tienda de productos).
 *
 * Cada estrategia = datos del rubro (negocio/<rubro>/datos.js: capacidades, Diseño,
 * config de reservas) + reglas (prepararProducto) + `reservas`, la vertical del mini
 * booking (cotizar, estadoInicial, enTransaccion…; vive en modules/reservas/<rubro>/)
 * + `agente`, el perfil del asesor (modules/agente/perfiles/<rubro>.js; null = el de productos).
 */
export const ESTRATEGIAS = {
  productos: { ...DATOS.productos, ...productos, reservas: null, agente: null },
  hotel: { ...DATOS.hotel, ...hotel, reservas: verticalHotel, agente: agenteHotel },
  // Tours, eventos y locales piden precio en el formulario igual que productos (su
  // ficha lo reemplaza luego por el precio "desde"). Si su regla cambia, tendrán su carpeta.
  tours: { ...DATOS.tours, ...productos, reservas: verticalTours, agente: agenteTours },
  eventos: { ...DATOS.eventos, ...productos, reservas: verticalEventos, agente: agenteEventos },
  locales: { ...DATOS.locales, ...productos, reservas: verticalLocal, agente: agenteLocales }
};

/**
 * Excepción por tienda: último recurso para algo de verdad único. Hereda del rubro
 * y reemplaza solo lo distinto, nunca una copia (ver "Variaciones por cliente"):
 *   [ID]: { ...ESTRATEGIAS.hotel, reservas: { ...verticalHotel, cotizar: cotizarEspecial } }
 * Vacío hasta que haya un caso real (tarea 4.4).
 */
const EXCEPCIONES = {};

/** @param {{ id: string, tipoNegocio: string }} tienda */
export const estrategiaDe = (tienda) =>
  EXCEPCIONES[tienda.id] ?? ESTRATEGIAS[tienda.tipoNegocio] ?? ESTRATEGIAS.productos;
