import { clave } from "../../idiomas/clave.js";
import { TRADUCTOR_BASE } from "../../idiomas/traductor.js";
import { fechaCortaLocal } from "../textos-fecha.js";

/**
 * Textos de la cotización de hotel: las líneas del precio y los errores de las
 * reglas (docs/specs/idiomas B7). Salen del catálogo de textos fijos en el
 * idioma de quien reserva; la reserva los guarda así (el negocio ve en qué
 * idioma reservó). Sin traductor, en el idioma base.
 *
 * Los plurales son dos claves ("{n} noche" / "{n} noches"): cada idioma los
 * traduce con su gramática. Los que en el idioma base se escriben igual llevan
 * un contexto ("{n} hab.|una") para que otro idioma pueda distinguirlos.
 */

const K = {
  habitacion: clave("{n} hab.|una"),
  habitaciones: clave("{n} hab."),
  estadiaHoras: clave("{n} horas"),
  noche: clave("{n} noche"),
  noches: clave("{n} noches"),
  ninoMayor: clave("{n} niño mayor de {edad} años"),
  ninosMayores: clave("{n} niños mayores de {edad} años"),
  unidad: {
    noche: clave("por noche"),
    persona: clave("por persona"),
    persona_noche: clave("por persona y noche")
  },
  igv: clave("Exoneración de IGV (turista extranjero)"),
  err: {
    extraInvalido: clave("Uno de los extras ya no está disponible"),
    modalidadInactiva: clave("Esta modalidad ya no está disponible"),
    nochesInvalidas: clave("Elige entre 1 y {max} noches"),
    habitacionesInvalidas: clave("Elige entre 1 y {max} habitaciones"),
    adultosInvalidos: clave("Debe haber al menos un adulto"),
    enHabitaciones: clave("en {n} habitaciones"),
    capAdulto: clave("Esta habitación admite hasta {n} adulto{en}"),
    capAdultos: clave("Esta habitación admite hasta {n} adultos{en}"),
    sinNinos: clave("Esta habitación no admite niños"),
    capNino: clave("Esta habitación admite hasta {n} niño{en}"),
    capNinos: clave("Esta habitación admite hasta {n} niños{en}"),
    capTotal: clave("Esta habitación admite hasta {n} personas en total{en}"),
    sinHabitaciones: clave("No quedan habitaciones de este tipo para esas fechas. Elige otras fechas"),
    quedaHabitacion: clave("Solo queda 1 habitación de este tipo para esas fechas"),
    quedanHabitaciones: clave("Solo quedan {n} habitaciones de este tipo para esas fechas"),
    fechaPasada: clave("Elige una fecha y hora futuras"),
    anticipacionHora: clave("Las reservas se piden con al menos {n} hora de anticipación"),
    anticipacionHoras: clave("Las reservas se piden con al menos {n} horas de anticipación"),
    fechaLejana: clave("Solo se puede reservar con hasta un año de anticipación"),
    minNoches: clave("Para llegar en {temporada} la estadía mínima es de {n} noches"),
    edades: clave("Indica la edad de cada niño"),
    cerrada: clave("No se reciben reservas para el {fecha}. Elige otra fecha")
  }
};

/**
 * @param {(clave: string, params?: object) => string} [t] - traductor del idioma de quien reserva (idiomas/textos.service.js)
 */
export function textosCotizar(t = TRADUCTOR_BASE) {
  const plural = (n, uno, varios, params = {}) => t(n === 1 ? uno : varios, { n, ...params });
  return {
    // 24/09 en español; cada idioma ordena día y mes a su modo ("Sep 24").
    fecha: (f) => fechaCortaLocal(t, f),
    habitaciones: (n) => ` × ${plural(n, K.habitacion, K.habitaciones)}`,
    estadiaHoras: (h) => t(K.estadiaHoras, { n: h }),
    noches: (n) => plural(n, K.noche, K.noches),
    ninos: (pagan, edad, veces, esHoras) =>
      `${plural(pagan, K.ninoMayor, K.ninosMayores, { edad })}${esHoras ? "" : ` × ${plural(veces, K.noche, K.noches)}`}`,
    unidadExtra: {
      estadia: "",
      noche: t(K.unidad.noche),
      persona: t(K.unidad.persona),
      persona_noche: t(K.unidad.persona_noche)
    },
    igv: t(K.igv),
    err: {
      extraInvalido: t(K.err.extraInvalido),
      modalidadInactiva: t(K.err.modalidadInactiva),
      nochesInvalidas: (max) => t(K.err.nochesInvalidas, { max }),
      habitacionesInvalidas: (max) => t(K.err.habitacionesInvalidas, { max }),
      adultosInvalidos: t(K.err.adultosInvalidos),
      enHabitaciones: (h) => (h > 1 ? ` ${t(K.err.enHabitaciones, { n: h })}` : ""),
      capAdultos: (max, en) => plural(max, K.err.capAdulto, K.err.capAdultos, { en }),
      sinNinos: t(K.err.sinNinos),
      capNinos: (max, en) => plural(max, K.err.capNino, K.err.capNinos, { en }),
      capTotal: (max, en) => t(K.err.capTotal, { n: max, en }),
      sinHabitaciones: t(K.err.sinHabitaciones),
      quedanHabitaciones: (n) => plural(n, K.err.quedaHabitacion, K.err.quedanHabitaciones),
      fechaPasada: t(K.err.fechaPasada),
      anticipacion: (h) => plural(h, K.err.anticipacionHora, K.err.anticipacionHoras),
      fechaLejana: t(K.err.fechaLejana),
      minNoches: (temporada, n) => t(K.err.minNoches, { temporada, n }),
      edades: t(K.err.edades),
      cerrada: (fecha) => t(K.err.cerrada, { fecha })
    }
  };
}
