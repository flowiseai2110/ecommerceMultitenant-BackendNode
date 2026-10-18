import { clave } from "../../idiomas/clave.js";
import { e, fechaHora, fila } from "../correo.comun.js";

// Lo propio de una compra de entradas en los correos (docs/specs/antipatrones 3b).

const VOZ_EVENTO = { Negocio: clave("El organizador|voz"), alNegocio: clave("al organizador|voz"), enNegocio: clave("en el lugar|voz"), inicio: clave("el inicio de la función|voz"), conf: clave("tu compra|voz") };

/** Filas propias del resumen: evento, función, lugar y entradas. */
function resumenEvento(r, t) {
  const f = (v) => e(fechaHora(v, t));
  const et = (k) => e(t(k));
  const entradas = (r.entradas ?? []).map((x) => `${x.nombre} × ${x.cantidad}`).join(", ") || "—";
  return fila(et(clave("Evento")), e(r.producto.nombre ?? "—")) +
    fila(et(clave("Función")), `${f(r.inicio)}${r.evento?.funcion ? ` · ${e(r.evento.funcion)}` : ""}`) +
    (r.evento?.lugar ? fila(et(clave("Lugar")), e(r.evento.lugar)) : "") +
    fila(et(clave("Entradas")), e(entradas));
}

/** Entradas confirmadas: el lugar es el del evento y se presentan en el ingreso. */
const confirmadaEvento = (r, t) => ({
  subject: t(clave("✅ Entradas confirmadas {codigo} — {evento}"), { codigo: r.codigo, evento: r.producto.nombre }),
  titulo: e(t(clave("¡Tus entradas están confirmadas!"))),
  lugar: r.evento?.lugar ?? r.producto.nombre,
  direccion: r.evento?.direccion,
  pie: e(t(clave("Presenta esta confirmación o tu código de compra y tu documento en el ingreso.")))
});

export const CORREO_EVENTO = {
  voz: () => VOZ_EVENTO,
  detalle: resumenEvento,
  // Una compra no se solicita: este asunto no llega a usarse (avisaAlNegocio: false en la vertical).
  asuntoSolicitud: (r) => `🛎️ Nueva solicitud ${r.codigo}: ${r.modalidad.etiqueta} · ingreso ${fechaHora(r.inicio)}`,
  confirmada: confirmadaEvento,
  avisaConsumos: false
};
