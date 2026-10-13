import { prisma } from "../../../config/prisma.js";
import { ConflictError } from "../../../utils/errors.js";
import { escapeHtml } from "../../../services/email.service.js";
import { cotizar, efectivoDe, enviar, obtenerSeguimiento, pedidoDeReserva } from "../reservas.service.js";

/**
 * Lo que el huésped hace desde su reserva antes de llegar (docs/specs/plantillas-por-rubro E8):
 *   - check-in en línea: datos de los acompañantes y hora estimada de llegada;
 *   - solicitar cambio de fechas: se cotiza para mostrarle el precio y si hay
 *     cupo, y el hotel decide (no cambia la reserva sola).
 */

const conflicto = (motivo, message) => new ConflictError(message, { message, motivo });

/** Hotel, confirmada (o aceptada) y antes del ingreso. */
function exigirEstadiaFutura(pedido, ahora) {
  if (pedido.tipo !== "hotel") throw conflicto("SOLO_HOTEL", "Disponible solo para reservas de hospedaje");
  const estado = efectivoDe(pedido, ahora);
  if (!["aceptada", "confirmada"].includes(estado)) throw conflicto("RESERVA_NO_ACTIVA", "Esta reserva ya no admite cambios");
  if (pedido.reserva.inicio <= ahora) throw conflicto("ESTADIA_INICIADA", "Tu estadía ya empezó: hazlo en recepción");
}

/** Check-in en línea: reemplaza los acompañantes y guarda la hora de llegada. */
export async function registrarCheckin(tiendaId, pedidoId, { acompanantes, horaLlegada, comentarios = null }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirEstadiaFutura(pedido, ahora);
  const max = Math.max(0, (pedido.reserva.adultos ?? 1) + (pedido.reserva.ninos ?? 0) - 1);
  const lista = acompanantes.slice(0, max).map(a => ({ ...a, docNumero: a.docNumero.toUpperCase() }));
  await prisma.$transaction(async (tx) => {
    await tx.reservas.update({
      where: { pedidoId },
      data: { acompanantes: lista, checkinOnline: { horaLlegada, comentarios, completadoEn: ahora.toISOString() } }
    });
    await tx.pedido_historial_estados.create({
      data: { pedidoId, estado: pedido.estado, notas: `Check-in en línea: ${lista.length + 1} huéspedes, llegada ${horaLlegada}` }
    });
  });
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

/**
 * Pide otras fechas: se cotizan con los mismos huéspedes y modalidad para
 * mostrar el total y si hay cupo, se guarda la solicitud y se avisa al hotel.
 * (La disponibilidad cuenta la propia reserva: si las fechas se cruzan, el hotel confirma.)
 */
export async function solicitarCambioFechas(tiendaId, pedidoId, { fecha, noches, comentario = null }, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  exigirEstadiaFutura(pedido, ahora);
  const r = pedido.reserva;
  const c = await cotizar({
    tiendaId, productoId: r.productoId, fecha, hora: null, modalidadId: r.modalidadId ?? undefined, noches,
    adultos: r.adultos ?? 1, ninos: r.ninos ?? 0, edadesNinos: r.edadesNinos ?? [], habitaciones: r.habitaciones ?? 1
  }, ahora);
  const solicitud = {
    fecha, noches, comentario,
    total: c.total, diferencia: Math.round((c.total - Number(pedido.total)) * 100) / 100,
    disponible: c.errores.length === 0, motivo: c.errores[0]?.mensaje ?? null,
    solicitadoEn: ahora.toISOString()
  };
  await prisma.$transaction(async (tx) => {
    await tx.reservas.update({ where: { pedidoId }, data: { cambioSolicitado: solicitud } });
    await tx.pedido_historial_estados.create({
      data: { pedidoId, estado: pedido.estado, notas: `Cambio de fechas solicitado: ${fecha}, ${noches} noche(s)${comentario ? ` · ${comentario}` : ""}` }
    });
  });

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { email: true } });
  enviar(tienda?.email, {
    subject: `Cambio de fechas solicitado · ${pedido.numeroPedido}`,
    html: `<p><strong>${escapeHtml(`${r.titularNombres} ${r.titularApellidos}`)}</strong> pide cambiar su reserva <strong>${escapeHtml(pedido.numeroPedido)}</strong>
      al <strong>${escapeHtml(fecha)}</strong> por ${noches} noche(s).</p>
      <p>Nuevo total cotizado: S/ ${c.total.toFixed(2)} (${solicitud.diferencia >= 0 ? "+" : ""}${solicitud.diferencia.toFixed(2)})
      · ${solicitud.disponible ? "hay disponibilidad" : `sin disponibilidad: ${escapeHtml(solicitud.motivo ?? "")}`}.</p>
      ${comentario ? `<p>Comentario: ${escapeHtml(comentario)}</p>` : ""}
      <p>Respóndele por WhatsApp o desde el panel.</p>`
  }, pedido.clienteEmail);
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}
