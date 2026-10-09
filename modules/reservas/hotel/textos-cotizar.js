/**
 * Textos de la cotización de hotel en español e inglés (docs/specs/hospedaje-completo
 * C3): las líneas del precio y los errores de las reglas. El huésped que reserva en
 * inglés los ve en inglés y la reserva los guarda así (el negocio ve que reservó en inglés).
 */

const plural = (n, uno, varios) => (n === 1 ? uno : varios);
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const es = {
  dias: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  fecha: null, // fechaCorta: 24/09
  personas: (n) => ` · ${n} ${plural(n, "persona", "personas")}`,
  habitaciones: (n) => ` · ${n} habitaciones`,
  estadiaHoras: (h) => `Estadía de ${h} horas`,
  noches: (n) => `${n} ${plural(n, "noche", "noches")}`,
  ninos: (pagan, edad, veces, esHoras) =>
    `${pagan} ${plural(pagan, "niño mayor", "niños mayores")} de ${edad} años${esHoras ? "" : ` × ${veces} ${plural(veces, "noche", "noches")}`}`,
  unidadExtra: { estadia: "", noche: "por noche", persona: "por persona", persona_noche: "por persona y noche" },
  igv: "Exoneración de IGV (turista extranjero)",
  err: {
    extraInvalido: "Uno de los extras ya no está disponible",
    modalidadInactiva: "Esta modalidad ya no está disponible",
    nochesInvalidas: (max) => `Elige entre 1 y ${max} noches`,
    habitacionesInvalidas: (max) => `Elige entre 1 y ${max} habitaciones`,
    adultosInvalidos: "Debe haber al menos un adulto",
    enHabitaciones: (h) => (h > 1 ? ` en ${h} habitaciones` : ""),
    capAdultos: (max, en) => `Esta habitación admite hasta ${max} ${plural(max, "adulto", "adultos")}${en}`,
    sinNinos: "Esta habitación no admite niños",
    capNinos: (max, en) => `Esta habitación admite hasta ${max} ${plural(max, "niño", "niños")}${en}`,
    capTotal: (max, en) => `Esta habitación admite hasta ${max} personas en total${en}`,
    sinCamas: "No quedan camas para esas fechas. Elige otras fechas",
    sinHabitaciones: "No quedan habitaciones de este tipo para esas fechas. Elige otras fechas",
    quedanCamas: (n) => `Solo quedan ${n} ${plural(n, "cama", "camas")} para esas fechas`,
    quedanHabitaciones: (n) => `Solo ${n === 1 ? "queda 1 habitación" : `quedan ${n} habitaciones`} de este tipo para esas fechas`,
    fechaPasada: "Elige una fecha y hora futuras",
    anticipacion: (h) => `Las reservas se piden con al menos ${h} ${plural(h, "hora", "horas")} de anticipación`,
    fechaLejana: "Solo se puede reservar con hasta un año de anticipación",
    minNoches: (temporada, n) => `Para llegar en ${temporada} la estadía mínima es de ${n} noches`,
    edades: "Indica la edad de cada niño",
    cerrada: (f) => `No se reciben reservas para el ${f}. Elige otra fecha`
  }
};

const en = {
  dias: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  // "Sep 24": 24/09 se lee al revés en inglés de EE. UU.
  fecha: (f) => `${MESES_EN[Number(f.slice(5, 7)) - 1]} ${Number(f.slice(8, 10))}`,
  personas: (n) => ` · ${n} ${plural(n, "guest", "guests")}`,
  habitaciones: (n) => ` · ${n} rooms`,
  estadiaHoras: (h) => `${h}-hour stay`,
  noches: (n) => `${n} ${plural(n, "night", "nights")}`,
  ninos: (pagan, edad, veces, esHoras) =>
    `${pagan} ${plural(pagan, "child", "children")} over ${edad}${esHoras ? "" : ` × ${veces} ${plural(veces, "night", "nights")}`}`,
  unidadExtra: { estadia: "", noche: "per night", persona: "per person", persona_noche: "per person per night" },
  igv: "IGV tax exemption (foreign tourist)",
  err: {
    extraInvalido: "One of the extras is no longer available",
    modalidadInactiva: "This rate is no longer available",
    nochesInvalidas: (max) => `Choose between 1 and ${max} nights`,
    habitacionesInvalidas: (max) => `Choose between 1 and ${max} rooms`,
    adultosInvalidos: "At least one adult is required",
    enHabitaciones: (h) => (h > 1 ? ` in ${h} rooms` : ""),
    capAdultos: (max, en2) => `This room fits up to ${max} ${plural(max, "adult", "adults")}${en2}`,
    sinNinos: "This room does not accept children",
    capNinos: (max, en2) => `This room fits up to ${max} ${plural(max, "child", "children")}${en2}`,
    capTotal: (max, en2) => `This room fits up to ${max} guests in total${en2}`,
    sinCamas: "No beds left for those dates. Please choose other dates",
    sinHabitaciones: "No rooms of this type left for those dates. Please choose other dates",
    quedanCamas: (n) => `Only ${n} ${plural(n, "bed", "beds")} left for those dates`,
    quedanHabitaciones: (n) => `Only ${n} ${plural(n, "room", "rooms")} of this type left for those dates`,
    fechaPasada: "Choose a future date and time",
    anticipacion: (h) => `Bookings must be made at least ${h} ${plural(h, "hour", "hours")} in advance`,
    fechaLejana: "Bookings can be made up to one year in advance",
    minNoches: (temporada, n) => `Arriving during ${temporada} requires a minimum stay of ${n} nights`,
    edades: "Tell us the age of each child",
    cerrada: (f) => `We are not taking bookings for ${f}. Please choose another date`
  }
};

/** @param {string|null|undefined} idioma */
export const textosCotizar = (idioma) => (idioma === "en" ? en : es);
