import { clave } from "../../idiomas/clave.js";
import { TRADUCTOR_BASE } from "../../idiomas/traductor.js";

// Lo propio de una estadía en el DTO de la reserva (docs/specs/antipatrones 3b).

export function etiquetaModalidad(modalidad, reserva) {
  const { clave: k, params } = textoModalidad(modalidad, reserva);
  return TRADUCTOR_BASE(k, params);
}

/**
 * La misma etiqueta como clave del catálogo + valores, para que la tienda la
 * traduzca en el idioma de la página: "3 noches" no es una clave, "{n} noches" sí
 * (docs/specs/idiomas D7).
 */
export function textoModalidad(modalidad, reserva) {
  const horas = reserva?.horas ?? modalidad?.horas;
  if ((modalidad?.tipo ?? (horas ? "horas" : "noche")) === "horas") return { clave: clave("{n} horas"), params: { n: horas } };
  const noches = reserva?.noches;
  if (!noches) return { clave: clave("Por noche"), params: {} };
  return { clave: noches === 1 ? clave("{n} noche") : clave("{n} noches"), params: { n: noches } };
}

/** Modalidad de la estadía y personas (adultos + niños). */
export function dtoHotel(pedido) {
  const r = pedido.reserva;
  return {
    modalidad: {
      id: r.modalidadId,
      tipo: r.modalidad?.tipo ?? (r.horas ? "horas" : "noche"),
      etiqueta: etiquetaModalidad(r.modalidad, r),
      texto: textoModalidad(r.modalidad, r)
    },
    personas: (r.adultos ?? 0) + (r.ninos ?? 0)
  };
}
