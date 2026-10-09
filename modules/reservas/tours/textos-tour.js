/**
 * Textos de la cotización de tours en español e inglés (docs/specs/hospedaje-completo
 * C3, extendido a tours): días de salida, precio "desde" y errores de las reglas.
 * El pasajero que reserva en inglés los ve en inglés.
 */

const plural = (n, uno, varios) => (n === 1 ? uno : varios);
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lista "a, b y c" / "a, b and c". */
const enumerar = (nombres, y) => (nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} ${y} ${nombres.at(-1)}`);

const es = {
  dias: ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"],
  todosLosDias: "todos los días",
  y: "y",
  fecha: null, // fechaCorta: 24/09
  desde: (tipo) => `por ${tipo.toLowerCase()}`,
  err: {
    horaRequerida: "Elige la hora de salida",
    horaInvalida: (horas) => `Este tour sale a las ${horas}`,
    diaSinSalida: (dias) => `Este tour sale ${dias === "todos los días" ? dias : `los ${dias}`}. Elige otra fecha`,
    idioma: "Este tour no se ofrece en ese idioma",
    tipoInvalido: "Uno de los tipos de pasajero ya no está disponible. Actualiza la página",
    sinPasajeros: "Indica cuántas personas van",
    maxPasajeros: (max) => `Puedes solicitar hasta ${max} ${plural(max, "persona", "personas")} por reserva. Para grupos más grandes, escribe a la agencia`,
    fechaPasada: "Esa salida ya pasó. Elige una fecha futura",
    anticipacion: (h) => `Los tours se reservan con al menos ${h} ${plural(h, "hora", "horas")} de anticipación`,
    fechaLejana: "Solo se puede reservar con hasta un año de anticipación",
    cerrada: (f) => `No hay salida el ${f}. Elige otra fecha`
  }
};

const en = {
  dias: ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
  todosLosDias: "every day",
  y: "and",
  fecha: (f) => `${MESES_EN[Number(f.slice(5, 7)) - 1]} ${Number(f.slice(8, 10))}`,
  desde: (tipo) => `per ${tipo.toLowerCase()}`,
  err: {
    horaRequerida: "Choose a departure time",
    horaInvalida: (horas) => `This tour departs at ${horas}`,
    diaSinSalida: (dias) => `This tour departs ${dias === "every day" ? dias : `on ${dias}`}. Please choose another date`,
    idioma: "This tour is not offered in that language",
    tipoInvalido: "One of the traveler types is no longer available. Please refresh the page",
    sinPasajeros: "Tell us how many people are going",
    maxPasajeros: (max) => `You can request up to ${max} ${plural(max, "person", "people")} per booking. For larger groups, please contact the agency`,
    fechaPasada: "That departure has already passed. Please choose a future date",
    anticipacion: (h) => `Tours must be booked at least ${h} ${plural(h, "hour", "hours")} in advance`,
    fechaLejana: "Bookings can be made up to one year in advance",
    cerrada: (f) => `There is no departure on ${f}. Please choose another date`
  }
};

/** @param {string|null|undefined} lang */
export const textosTour = (lang) => (lang === "en" ? en : es);

/** "lunes, miércoles y viernes" / "Mondays, Wednesdays and Fridays" / "todos los días". */
export function diasSalidaTexto(dias, lang = "es") {
  const t = textosTour(lang);
  const orden = [...new Set(dias)].sort((a, b) => a - b);
  if (orden.length === 7) return t.todosLosDias;
  return enumerar(orden.map(d => t.dias[d]), t.y);
}
