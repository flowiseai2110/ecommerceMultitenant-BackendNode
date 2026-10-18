import { clave } from "../../idiomas/clave.js";
import { b, e, fechaHora, fila, hora, html, soles, texto } from "../correo.comun.js";

// Lo propio de un turno de cancha en los correos (docs/specs/antipatrones 3b).

const VOZ_CANCHA = { Negocio: clave("La cancha|voz"), alNegocio: clave("a la cancha|voz"), enNegocio: clave("en la cancha|voz"), inicio: clave("la hora del partido|voz"), conf: clave("el horario|voz") };

/** Filas propias del resumen: cancha, horario y, con adelanto, el saldo en la cancha. */
function resumenCancha(r, t) {
  const et = (k) => e(t(k));
  return fila(et(clave("Cancha")), e(`${r.cancha?.nombre ?? r.producto.nombre ?? "—"}${r.cancha?.formato ? ` · ${r.cancha.formato}` : ""}`)) +
    fila(et(clave("Horario")), e(t(clave("{inicio} a {fin}|horario"), { inicio: fechaHora(r.inicio, t), fin: hora.format(new Date(r.fin)) }))) +
    (r.montoAPagar && r.montoAPagar < r.total
      ? fila(et(clave("Adelanto")), soles(r.montoAPagar)) + fila(et(clave("Saldo en la cancha")), soles(r.total - r.montoAPagar))
      : "");
}

/** Aceptada (alquiler-canchas R5): el horario queda apartado unos minutos mientras se paga el adelanto. */
function aceptadaCancha({ r, t, nombre, negocio, monto, ajuste, saldo }) {
  const hasta = r.cancha?.apartadoHasta ? hora.format(new Date(r.cancha.apartadoHasta)) : null;
  return {
    subject: t(clave("Separamos tu horario {codigo}: paga el adelanto"), { codigo: r.codigo }),
    titulo: e(t(clave("Separamos tu horario"))),
    intro:
      texto(hasta
        ? html(t, clave("Hola {nombre}, tu horario en {negocio} está apartado hasta las {hora}. Para confirmarlo, paga el adelanto de {monto} y sube la captura desde el link."), { nombre, negocio, monto, hora: b(hasta) })
        : html(t, clave("Hola {nombre}, tu horario en {negocio} está apartado. Para confirmarlo, paga el adelanto de {monto} y sube la captura desde el link."), { nombre, negocio, monto })) +
      ajuste + saldo,
    pie: e(t(clave("Si no subes la captura a tiempo, el horario se libera para otro equipo.")))
  };
}

export const CORREO_CANCHA = {
  voz: () => VOZ_CANCHA,
  detalle: resumenCancha,
  asuntoSolicitud: (r) => `⚽ Nueva solicitud ${r.codigo}: ${r.cancha?.nombre ?? r.producto.nombre} · ${fechaHora(r.inicio)}`,
  queNuevaReserva: (r) => `${r.cancha?.nombre ?? r.producto.nombre} · `,
  aceptada: aceptadaCancha,
  avisaConsumos: true
};
