import { cotizarEvento } from "./cotizar.js";
import { apartarEntradas, cargarFuncionParaCompra, moverVendidos } from "./eventos.service.js";
import { anularEntradas, emitirEntradas } from "./entradas.js";

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
  async enTransaccion(tx, { tiendaId, pedidoId, c, estadoInicial, ahora }) {
    await apartarEntradas(tx, { tiendaId, pedidoId, items: c.items, confirmar: estadoInicial === "confirmada", ahora });
    // Entrada libre: confirmada en el acto, con sus entradas QR.
    if (estadoInicial === "confirmada") await emitirEntradas(tx, { tiendaId, pedidoId });
  },
  /** Entradas con QR (plantillas-por-rubro E6): se emiten al confirmar y se anulan al cancelar. */
  async alCambiarEstado(tx, { pedido, anterior, nuevo }) {
    // Pagada: el cupo apartado pasa a vendido (filas bloqueadas; el CHECK impide sobrevender).
    if (nuevo === "confirmada") {
      await moverVendidos(tx, pedido.tiendaId, pedido.id, +1);
      await emitirEntradas(tx, { tiendaId: pedido.tiendaId, pedidoId: pedido.id });
    }
    if (nuevo === "cancelada") {
      // Las vendidas vuelven a la venta; las apartadas se liberan solas con el cambio de estado.
      if (anterior === "confirmada") await moverVendidos(tx, pedido.tiendaId, pedido.id, -1);
      await anularEntradas(tx, pedido.id);
    }
  },
  // Compra de entradas: el organizador no tiene nada que responder (se le avisa al subir la captura).
  avisaAlNegocio: false,
  mensajeMaxAbiertas: (abiertas, este) =>
    `Ya tienes ${abiertas} compras pendientes de pago en ${este}. Completa o cancela alguna antes de hacer otra.`,
  notasIniciales: {
    por_pagar: "Compra de entradas: cupo apartado hasta recibir el pago",
    confirmada: "Entradas libres confirmadas desde la vitrina"
  }
};
