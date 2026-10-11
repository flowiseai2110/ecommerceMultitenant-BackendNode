import { cierresDeProducto } from "../cierres.service.js";
import { cotizarTour } from "./cotizar.js";
import { cargarTourParaReserva } from "./tours.service.js";

/** Reservas de tours (Strategy de reservas, modules/negocio/registro.js). */
export const verticalTours = {
  tipoPedido: "tour",
  este: "esta agencia",
  async cotizar({ tiendaId, datos, config, ahora }) {
    const { producto, tour, tiposPasajero } = await cargarTourParaReserva(tiendaId, datos.productoId, datos.lang);
    const cierres = await cierresDeProducto(tiendaId, datos.productoId, datos.fecha, datos.fecha);
    const c = cotizarTour({
      tour, tiposPasajero, pasajeros: datos.pasajeros, fecha: datos.fecha, hora: datos.hora,
      idioma: datos.idioma, cierres, config, ahora, lang: datos.lang
    });
    return {
      producto, c,
      detalle: { pasajeros: c.pasajeros, idioma: c.idioma },
      log: `${c.personas} pax, salida ${c.inicio.toISOString()}`
    };
  }
};
