import { fechaLima } from "../tiempo.js";
import { resumenPlan } from "./plan-pagos.js";
import { etiquetaTipoEvento } from "./cotizar.js";
import { etiquetaConcepto } from "./contrato.js";
import { num } from "../dto.comun.js";

// Lo propio del alquiler de un local en el DTO de la reserva (docs/specs/antipatrones 3b).

const serializarCuota = (c) => ({
  id: c.id,
  numero: c.numero,
  concepto: c.concepto,
  conceptoEtiqueta: etiquetaConcepto(c.concepto),
  monto: num(c.monto),
  // Columna DATE (medianoche UTC): se lee tal cual, sin pasar a hora de Lima.
  venceEn: (c.venceEn instanceof Date ? c.venceEn.toISOString() : String(c.venceEn)).slice(0, 10),
  estado: c.estado,
  pagadaEn: c.pagadaEn ?? null
});

/**
 * Alquiler de locales (alquiler-locales R7.5): salón, turno, paquete, plan de
 * pagos con su resumen (pagado, saldo, próxima cuota, mora, garantía) y el
 * estado del contrato. El texto del contrato lo agrega cada audiencia.
 */
function bloqueLocal(pedido, estado, ahora) {
  const r = pedido.reserva;
  const l = r.local ?? {};
  const cuotas = (pedido.cuotas ?? []).filter(c => c.estado !== "anulada");
  return {
    salon: l.salon?.nombre ?? null,
    aforoMaximo: l.salon?.aforoMaximo ?? null,
    turno: l.turno ?? null,
    paquete: l.paquete ?? null,
    tipoEvento: r.tipoEvento,
    tipoEventoEtiqueta: etiquetaTipoEvento(r.tipoEvento),
    invitados: r.invitados,
    agasajado: r.agasajado,
    fecha: l.fecha ?? fechaLima(r.inicio),
    horaInicio: l.horaInicio ?? null,
    horaFin: l.horaFin ?? null,
    proveedoresExternos: l.proveedoresExternos ?? false,
    garantia: num(l.garantia) ?? 0,
    // Hasta cuándo la fecha queda apartada sin respuesta o sin pago (R6.4).
    apartadoHasta: ["solicitada", "aceptada"].includes(estado) ? r.apartadoHasta : null,
    plan: cuotas.map(serializarCuota),
    resumen: resumenPlan(cuotas, fechaLima(ahora)),
    contrato: r.contrato ? { version: r.contrato.version, hash: r.contrato.hash, generadoEn: r.contrato.generadoEn, aceptadoEn: r.contrato.aceptadoEn ?? null } : null,
    reprogramaciones: r.reprogramaciones ?? 0
  };
}

export function dtoLocal(pedido, { estado, ahora }) {
  return { local: bloqueLocal(pedido, estado, ahora), personas: pedido.reserva.invitados ?? 0 };
}

/** Admin: contrato completo y cambios (ajustes de monto y de plan). */
export function dtoAdminLocal(pedido) {
  const r = pedido.reserva;
  return {
    contratoTexto: r.contrato?.texto ?? null,
    contratoAceptadoPor: r.contrato?.aceptadoPor ?? null,
    cambios: (pedido.cambios ?? []).map(c => ({
      tipo: c.tipo, actor: c.actor, motivo: c.motivo, nota: c.nota, diferencia: num(c.diferencia), antes: c.antes, despues: c.despues, fecha: c.fechaRegistro
    }))
  };
}
