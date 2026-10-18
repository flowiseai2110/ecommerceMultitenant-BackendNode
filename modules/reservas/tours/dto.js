import { localizar } from "../../traducciones/localizar.js";
import { FUENTES } from "../../traducciones/fuentes.js";
import { num } from "../dto.comun.js";

// Lo propio de una salida de tour en el DTO de la reserva (docs/specs/antipatrones 3b).

/** Pasajeros de un tour (snapshot guardado al solicitar). */
const pasajerosDe = (r) => (Array.isArray(r.pasajeros) ? r.pasajeros : []).map(p => ({
  tipoId: p.tipoId, nombre: p.nombre, cantidad: p.cantidad, precio: num(p.precio)
}));

function fichaTour(r) {
  const t = localizar(FUENTES.tours, { tour: r.producto?.tour ?? {}, traducciones: r.producto?.traducciones }, r.idiomaHuesped).tour;
  return { duracion: t.duracion ?? null, puntoEncuentro: t.puntoEncuentro ?? null, mapaUrl: r.producto?.tour?.mapaUrl ?? null, recojo: t.recojo ?? null };
}

/**
 * Pasajeros y lo que el pasajero necesita para llegar a la salida (confirmación,
 * R8.1); en inglés si reservó en inglés (C3).
 */
export function dtoTour(pedido) {
  const r = pedido.reserva;
  const pasajeros = pasajerosDe(r);
  return { pasajeros, tour: fichaTour(r), personas: pasajeros.reduce((s, p) => s + p.cantidad, 0) };
}
