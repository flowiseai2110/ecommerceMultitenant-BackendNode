import { cotizarEvento } from "./cotizar.js";
import { apartarEntradas, cargarFuncionParaCompra } from "./eventos.service.js";

/** Compra de entradas (Strategy de reservas, modules/negocio/registro.js). */
export const verticalEventos = {
  tipoPedido: "evento",
  este: "este evento",
  async cotizar({ tiendaId, datos, config, ahora }) {
    const { producto, funcion, tipos, apartadas } = await cargarFuncionParaCompra(tiendaId, datos.productoId, datos.funcionId, ahora);
    const c = cotizarEvento({ funcion, tipos, apartadas, entradas: datos.entradas, config, ahora });
    return {
      producto, c,
      detalle: { funcionId: funcion.id, apartadoHasta: c.total > 0 ? c.apartadoHasta : null },
      log: `${c.personas} entradas, función ${c.inicio.toISOString()}`
    };
  },
  // Sin solicitud: la compra aparta el cupo y espera el pago. Gratis = confirmada en el acto.
  estadoInicial: (c) => (c.total > 0 ? "por_pagar" : "confirmada"),
  // Cuentan las compras que retienen cupo (anti-acaparamiento).
  whereAbiertas: (ahora) => ({
    OR: [{ estado: "pago_en_revision" }, { estado: "por_pagar", reserva: { apartadoHasta: { gt: ahora }, inicio: { gt: ahora } } }]
  }),
  /** Dentro de la transacción: bloquea los tipos, revalida el cupo y registra las entradas. */
  enTransaccion: (tx, { tiendaId, pedidoId, c, estadoInicial, ahora }) =>
    apartarEntradas(tx, { tiendaId, pedidoId, items: c.items, confirmar: estadoInicial === "confirmada", ahora })
};
