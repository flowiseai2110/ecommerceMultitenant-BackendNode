// Lo propio de un turno de cancha en el DTO de la reserva (docs/specs/antipatrones 3b).

/** Formato, duración y tramos día/noche (foto de la reserva) y hasta cuándo se aparta sin pagar. */
export function dtoCancha(pedido, { estado }) {
  const r = pedido.reserva;
  return {
    cancha: {
      nombre: r.cancha?.nombre ?? r.producto?.nombre ?? null,
      formato: r.cancha?.formato ?? null,
      techada: r.cancha?.techada ?? false,
      jugadoresMax: r.cancha?.jugadoresMax ?? null,
      duracionMin: r.cancha?.duracionMin ?? null,
      tramos: r.cancha?.tramos ?? [],
      apartadoHasta: ["solicitada", "aceptada"].includes(estado) ? r.apartadoHasta : null,
      // Pago dividido (plantillas-por-rubro E7): cuántas partes y cuántas pagadas; los links, en GET /partes.
      pagoDividido: (pedido.partesPago ?? []).length
        ? { partes: pedido.partesPago.length, pagadas: pedido.partesPago.filter(p => p.estado === "pagada").length }
        : null
    },
    personas: 0
  };
}
