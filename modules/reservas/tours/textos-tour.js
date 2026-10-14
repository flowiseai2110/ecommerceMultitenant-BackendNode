import { clave } from "../../idiomas/clave.js";
import { TRADUCTOR_BASE } from "../../idiomas/traductor.js";
import { fechaCortaLocal } from "../textos-fecha.js";

/**
 * Textos de la cotización de tours: días de salida, precio "desde" y errores
 * de las reglas (docs/specs/idiomas B7). Salen del catálogo de textos fijos en
 * el idioma de quien reserva; sin traductor, en el idioma base.
 */

const K = {
  // Índice = día ISO (1 = lunes … 7 = domingo).
  dias: [null,
    clave("lunes|días de salida"), clave("martes|días de salida"), clave("miércoles|días de salida"), clave("jueves|días de salida"),
    clave("viernes|días de salida"), clave("sábados|días de salida"), clave("domingos|días de salida")],
  todosLosDias: clave("todos los días"),
  lista: clave("{lista} y {ultimo}"),
  desde: clave("por {tipo}|precio desde"),
  err: {
    horaRequerida: clave("Elige la hora de salida"),
    horaInvalida: clave("Este tour sale a las {horas}"),
    saleTodosLosDias: clave("Este tour sale todos los días. Elige otra fecha"),
    diaSinSalida: clave("Este tour sale los {dias}. Elige otra fecha"),
    idioma: clave("Este tour no se ofrece en ese idioma"),
    tipoInvalido: clave("Uno de los tipos de pasajero ya no está disponible. Actualiza la página"),
    sinPasajeros: clave("Indica cuántas personas van"),
    maxPersona: clave("Puedes solicitar hasta {n} persona por reserva. Para grupos más grandes, escribe a la agencia"),
    maxPersonas: clave("Puedes solicitar hasta {n} personas por reserva. Para grupos más grandes, escribe a la agencia"),
    fechaPasada: clave("Esa salida ya pasó. Elige una fecha futura"),
    anticipacionHora: clave("Los tours se reservan con al menos {n} hora de anticipación"),
    anticipacionHoras: clave("Los tours se reservan con al menos {n} horas de anticipación"),
    fechaLejana: clave("Solo se puede reservar con hasta un año de anticipación"),
    cerrada: clave("No hay salida el {fecha}. Elige otra fecha")
  }
};

/** "lunes, miércoles y viernes" / "Mondays, Wednesdays and Fridays" / "todos los días". */
export function diasSalidaTexto(dias, t = TRADUCTOR_BASE) {
  const orden = [...new Set(dias)].sort((a, b) => a - b);
  if (orden.length === 7) return t(K.todosLosDias);
  const nombres = orden.map((d) => t(K.dias[d]));
  return nombres.length === 1 ? nombres[0] : t(K.lista, { lista: nombres.slice(0, -1).join(", "), ultimo: nombres.at(-1) });
}

/**
 * @param {(clave: string, params?: object) => string} [t] - traductor del idioma de quien reserva (idiomas/textos.service.js)
 */
export function textosTour(t = TRADUCTOR_BASE) {
  const plural = (n, uno, varios) => t(n === 1 ? uno : varios, { n });
  return {
    fecha: (f) => fechaCortaLocal(t, f),
    desde: (tipo) => t(K.desde, { tipo: tipo.toLowerCase() }),
    err: {
      horaRequerida: t(K.err.horaRequerida),
      horaInvalida: (horas) => t(K.err.horaInvalida, { horas }),
      // `dias` sale de diasSalidaTexto con el mismo traductor.
      diaSinSalida: (dias) => (dias === t(K.todosLosDias) ? t(K.err.saleTodosLosDias) : t(K.err.diaSinSalida, { dias })),
      idioma: t(K.err.idioma),
      tipoInvalido: t(K.err.tipoInvalido),
      sinPasajeros: t(K.err.sinPasajeros),
      maxPasajeros: (max) => plural(max, K.err.maxPersona, K.err.maxPersonas),
      fechaPasada: t(K.err.fechaPasada),
      anticipacion: (h) => plural(h, K.err.anticipacionHora, K.err.anticipacionHoras),
      fechaLejana: t(K.err.fechaLejana),
      cerrada: (fecha) => t(K.err.cerrada, { fecha })
    }
  };
}
