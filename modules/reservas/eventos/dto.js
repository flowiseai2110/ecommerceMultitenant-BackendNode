import { serializarEntrada } from "./entradas.js";
import { num } from "../dto.comun.js";

// Lo propio de una compra de entradas en el DTO de la reserva (docs/specs/antipatrones 3b).

/** Entradas de una compra de evento (snapshot guardado al comprar). */
const entradasDe = (pedido) => (pedido.itemsEvento ?? []).map(i => ({
  tipoId: i.tipoEntradaId, nombre: i.nombre, cantidad: i.cantidad, precio: num(i.precio)
}));

export function dtoEvento(pedido, { estado }) {
  const r = pedido.reserva;
  const entradas = entradasDe(pedido);
  return {
    // Función y lugar del evento; hasta cuándo se guarda el cupo si falta pagar.
    evento: {
      funcionId: r.funcionId,
      funcion: r.funcion?.nombre ?? null,
      lugar: r.producto?.evento?.lugar ?? null,
      direccion: r.producto?.evento?.direccion ?? null,
      mapaUrl: r.producto?.evento?.mapaUrl ?? null,
      organizador: r.producto?.evento?.organizador ?? null,
      apartadoHasta: estado === "por_pagar" ? r.apartadoHasta : null
    },
    entradas,
    // Entradas con QR por persona: solo con la compra confirmada (plantillas-por-rubro E6).
    entradasEmitidas: ["confirmada", "completada"].includes(estado)
      ? (pedido.entradasEvento ?? []).filter(e => !e.anulada).map(serializarEntrada)
      : [],
    personas: entradas.reduce((s, e) => s + e.cantidad, 0)
  };
}
