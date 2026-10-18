import { clave } from "../../idiomas/clave.js";
import { b, e, fechaHora, fila, hora, html, soles, texto } from "../correo.comun.js";

// Lo propio del alquiler de un local en los correos (docs/specs/antipatrones 3b).

const VOZ_LOCAL = { Negocio: clave("El local|voz"), alNegocio: clave("al local|voz"), enNegocio: clave("en el local|voz"), inicio: clave("la fecha del evento|voz"), conf: clave("la fecha|voz") };

/** Filas propias del resumen: salón, evento, fecha, invitados, paquete, separación y garantía. */
function resumenLocal(r, t) {
  const f = (v) => e(fechaHora(v, t));
  const et = (k) => e(t(k));
  const l = r.local;
  return fila(et(clave("Salón")), e(l?.salon ?? r.producto.nombre ?? "—")) +
    fila(et(clave("Evento")), e(`${l?.tipoEventoEtiqueta ?? "—"}${l?.agasajado ? ` · ${l.agasajado}` : ""}`)) +
    fila(et(clave("Fecha")), `${f(r.inicio)}${l?.turno?.nombre ? ` · ${html(t, clave("turno {nombre}"), { nombre: e(l.turno.nombre) })}` : ""} · ${e(t(clave("hasta las {hora}"), { hora: l?.horaFin ?? hora.format(new Date(r.fin)) }))}`) +
    fila(et(clave("Invitados")), e(String(l?.invitados ?? "—"))) +
    (l?.paquete?.nombre ? fila(et(clave("Paquete")), e(l.paquete.nombre)) : "") +
    (r.montoAPagar ? fila(et(clave("Separación")), soles(r.montoAPagar)) : "") +
    (l?.garantia ? fila(et(clave("Garantía")), soles(l.garantia)) : "");
}

/** Aceptada (alquiler-locales R8.3, R7): contrato primero, luego la separación; el resto en cuotas. */
const aceptadaLocal = ({ r, t, nombre, negocio, monto, ajuste }) => ({
  intro: texto(r.local?.apartadoHasta
    ? html(t, clave("Hola {nombre}, {negocio} aceptó tu solicitud. Para separar la fecha, lee y acepta el contrato, y paga la separación de {monto} antes del {fecha}."), { nombre, negocio, monto, fecha: e(fechaHora(r.local.apartadoHasta, t)) })
    : html(t, clave("Hola {nombre}, {negocio} aceptó tu solicitud. Para separar la fecha, lee y acepta el contrato, y paga la separación de {monto}."), { nombre, negocio, monto })) +
    texto(e(t(clave("El resto se paga en cuotas según el plan de pagos que verás en el link.")))) + ajuste,
  boton: e(t(clave("Ver contrato y pagar"))),
  pie: e(t(clave("Si no pagas la separación a tiempo, la fecha se libera.")))
});

/** Confirmada: lo pagado y lo que falta según el plan de pagos (R7.5). */
const confirmadaLocal = (r, t) => ({
  pagado: html(t, clave("Pagado: {pagado}. Saldo: {saldo}."), { pagado: b(soles(r.local?.resumen?.pagado)), saldo: b(soles(r.local?.resumen?.saldo)) }) +
    (r.local?.resumen?.proximaCuota
      ? ` ${html(t, clave("Próxima cuota: {monto} hasta el {fecha}."), { monto: soles(r.local.resumen.proximaCuota.monto), fecha: e(r.local.resumen.proximaCuota.venceEn.split("-").reverse().join("/")) })}`
      : "")
});

export const CORREO_LOCAL = {
  voz: () => VOZ_LOCAL,
  detalle: resumenLocal,
  asuntoSolicitud: (r) => `🎉 Nueva solicitud ${r.codigo}: ${r.local?.tipoEventoEtiqueta ?? "evento"} · ${r.local?.invitados ?? r.personas} invitados · ${fechaHora(r.inicio)}`,
  aceptada: aceptadaLocal,
  confirmada: confirmadaLocal,
  avisaConsumos: true
};
