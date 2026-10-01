// Catálogo de campañas del calendario comercial peruano. Es de la plataforma
// (no de cada tienda): la tienda solo activa un preset y, si quiere, cambia
// algunos campos (ver docs/specs/campanas-widgets). Si mejoramos un texto o
// una paleta aquí, lo reciben todas las tiendas que no lo personalizaron.
//
// Misma forma que FrontendStore src/app/core/theme/campanas.ts (de donde se
// portó): mantener ambos en sincronía hasta que el storefront deje de usar
// su copia fuera del selector de desarrollo.
//
// regla: cómo se calcula la fecha clave de cada año (ver calendario.js).
// rubros: rubros de tienda (modules/tenants/rubros.js) donde se sugiere; "*" = todos.
// Los textos son genéricos a propósito: no prometen envoltorio, descuentos
// ni plazos de entrega que la tienda quizá no tenga.

const TINTE = { topBar: "primario", header: "tinte", pagina: "tinte", footer: "oscuro" };
const MARCO = { topBar: "primario", header: "blanco", pagina: "blanco", footer: "oscuro" };
const NOCHE = { topBar: "oscuro", header: "blanco", pagina: "neutro", footer: "oscuro" };

const ENVIO = "Envíos a todo el Perú";
const PAGO = "Paga con Yape o Plin";

/** Widget del preset: figura del catálogo (string) o contenido completo. */
function widget(contenido, ancla, animacion, extra = {}) {
  return {
    contenido: typeof contenido === "string" ? { tipo: "figura", figura: contenido } : contenido,
    ancla,
    animacion,
    tamano: "mediano",
    // El de abajo y el flotante solo en desktop: en móvil ahí van los
    // botones del hero y el bottom nav.
    enMovil: ancla === "hero-arriba-derecha",
    ...extra
  };
}

/** Esquinas derechas del hero + flotante: la combinación de casi todos los presets. */
function w(arriba, abajo, flotante) {
  return [
    widget(arriba[0], "hero-arriba-derecha", arriba[1]),
    ...(abajo ? [widget(abajo[0], "hero-abajo-derecha", abajo[1])] : []),
    widget(flotante[0], "flotante-izquierda", flotante[1])
  ];
}

function congelar(obj) {
  Object.values(obj).forEach((v) => v && typeof v === "object" && congelar(v));
  return Object.freeze(obj);
}

// Congelado: el resolver mezcla presets con personalizaciones y nunca debe
// mutar el catálogo compartido entre requests.
export const CAMPANA_PRESETS = congelar([
  {
    id: "verano",
    nombre: "Rebajas de verano",
    regla: { tipo: "fija", mes: 1, dia: 2 },
    anticipacionDias: 0,
    despuesDias: 44,
    rubros: "*",
    paleta: { primario: "#0e7490", neutro: "stone", fondos: TINTE },
    topBar: "Rebajas de verano: aprovecha antes de que se acaben",
    hero: { titulo: "Llegó el verano", subtitulo: "Precios que también se derriten: renuévate para la temporada.", textoBoton: "Ver ofertas" },
    cinta: ["Rebajas de verano", "Precios al sol", ENVIO, PAGO],
    widgets: w(["sol", "girar"], ["sombrilla", "balanceo"], ["sombrilla", "balanceo"])
  },
  {
    id: "amistad",
    nombre: "Día del Amor y la Amistad",
    regla: { tipo: "fija", mes: 2, dia: 14 },
    anticipacionDias: 14,
    // Cae dentro de las rebajas de verano.
    prioridad: 2,
    rubros: "*",
    paleta: { primario: "#e11d48", neutro: "neutral", fondos: TINTE },
    topBar: "Pide con tiempo y llega antes del 14 de febrero",
    hero: { titulo: "Regala algo que sí van a usar", subtitulo: "Para tu pareja o tu pata de siempre: detalles que dicen más que un mensaje.", textoBoton: "Ver regalos" },
    cinta: ["Día del Amor y la Amistad", "Regalos para tu persona favorita", ENVIO, PAGO],
    widgets: w(["corazon", "latir"], ["globo", "flotar"], ["corazon", "latir"])
  },
  {
    id: "nino",
    nombre: "Día del Niño",
    // Día del Niño Peruano: segundo domingo de abril (Ley 27666).
    regla: { tipo: "nEsimoDia", mes: 4, diaSemana: 0, n: 2 },
    anticipacionDias: 14,
    rubros: ["general", "moda", "tecnologia", "hogar", "alimentos"],
    paleta: { primario: "#0284c7", neutro: "slate", fondos: TINTE },
    topBar: "Se viene el Día del Niño: sorpréndelos este domingo",
    hero: { titulo: "Que se diviertan en grande", subtitulo: "Celebra el Día del Niño con regalos que los harán saltar de alegría.", textoBoton: "Ver regalos" },
    cinta: ["Día del Niño", "Regalos que sacan sonrisas", ENVIO, PAGO],
    widgets: w(["globo", "flotar"], ["estrella", "girar"], ["globo", "flotar"])
  },
  {
    id: "madre",
    nombre: "Día de la Madre",
    regla: { tipo: "nEsimoDia", mes: 5, diaSemana: 0, n: 2 },
    anticipacionDias: 20,
    rubros: "*",
    paleta: { primario: "#db2777", neutro: "stone", fondos: TINTE },
    topBar: "Día de la Madre: pide con tiempo y llega a tiempo",
    hero: { titulo: "Para la que siempre está", subtitulo: "Este Día de la Madre, engríela con algo pensado para ella.", textoBoton: "Ver regalos para mamá" },
    cinta: ["Día de la Madre", "Regalos para engreírla", ENVIO, PAGO],
    oferta: { titulo: "Faltan pocos días para el Día de la Madre", texto: "Pide hoy y asegura que su regalo llegue a tiempo.", textoBoton: "Elegir su regalo" },
    widgets: w(["corazon", "latir"], ["flor", "balanceo"], ["flor", "balanceo"])
  },
  {
    id: "padre",
    nombre: "Día del Padre",
    regla: { tipo: "nEsimoDia", mes: 6, diaSemana: 0, n: 3 },
    anticipacionDias: 15,
    rubros: "*",
    paleta: { primario: "#1e3a8a", neutro: "slate", fondos: MARCO },
    topBar: "Día del Padre: el regalo que sí va a usar",
    hero: { titulo: "Papá también se engríe", subtitulo: "Ideas para el que todo lo arregla y nunca pide nada.", textoBoton: "Ver regalos para papá" },
    cinta: ["Día del Padre", "Regalos para el viejo", ENVIO, PAGO],
    oferta: { titulo: "Se viene el Día del Padre", texto: "Todavía estás a tiempo de sorprenderlo.", textoBoton: "Elegir su regalo" },
    widgets: w(["corbata", "balanceo"], ["estrella", "girar"], ["corbata", "balanceo"])
  },
  {
    id: "fiestas-patrias",
    nombre: "Fiestas Patrias",
    regla: { tipo: "fija", mes: 7, dia: 28 },
    anticipacionDias: 18,
    despuesDias: 1,
    rubros: "*",
    paleta: { primario: "#d91023", neutro: "neutral", fondos: MARCO },
    topBar: "Precios de fiesta por Fiestas Patrias",
    hero: { titulo: "¡Felices Fiestas Patrias!", subtitulo: "Celebra este 28 y aprovecha tu gratificación en lo que de verdad quieres.", textoBoton: "Ver ofertas" },
    cinta: ["Felices Fiestas Patrias", "Arriba Perú", ENVIO, PAGO],
    widgets: w(["escarapela", "balanceo"], ["estrella", "girar"], ["escarapela", "balanceo"])
  },
  {
    id: "primavera",
    nombre: "Primavera y Día de la Juventud",
    regla: { tipo: "fija", mes: 9, dia: 23 },
    anticipacionDias: 8,
    despuesDias: 7,
    rubros: ["general", "moda", "belleza", "hogar"],
    paleta: { primario: "#16a34a", neutro: "stone", fondos: TINTE },
    topBar: "Llegó la primavera: renueva lo tuyo",
    hero: { titulo: "Llegó la primavera", subtitulo: "Colores nuevos, energía nueva: dale vida a esta temporada.", textoBoton: "Ver novedades" },
    cinta: ["Primavera", "Día de la Juventud", "Novedades de temporada", ENVIO],
    widgets: w(["flor", "balanceo"], ["sol", "girar"], ["flor", "balanceo"])
  },
  {
    id: "halloween",
    nombre: "Halloween",
    regla: { tipo: "fija", mes: 10, dia: 31 },
    anticipacionDias: 16,
    rubros: ["general", "moda", "alimentos", "mascotas", "hogar"],
    paleta: { primario: "#ea580c", neutro: "zinc", fondos: NOCHE },
    topBar: "Halloween se acerca: prepárate para el 31",
    hero: { titulo: "Noche de Halloween", subtitulo: "Todo para asustar (o antojar) este 31 de octubre.", textoBoton: "Ver lo de Halloween" },
    cinta: ["Halloween", "Truco o trato", ENVIO, PAGO],
    oferta: { titulo: "Halloween ya casi está aquí", texto: "Pide ahora y tenlo listo para la noche del 31.", textoBoton: "Ver productos" },
    widgets: w(["calabaza", "balanceo"], ["murcielago", "flotar"], ["calabaza", "balanceo"])
  },
  {
    id: "black-friday",
    nombre: "Black Friday",
    // Viernes siguiente al 4.º jueves de noviembre; sigue hasta el Cyber Monday.
    regla: { tipo: "nEsimoDia", mes: 11, diaSemana: 4, n: 4, desfase: 1 },
    anticipacionDias: 7,
    despuesDias: 3,
    prioridad: 2,
    rubros: "*",
    paleta: { primario: "#18181b", neutro: "zinc", fondos: MARCO },
    topBar: "Black Friday: los mejores precios del año",
    hero: { titulo: "Black Friday", subtitulo: "Los mejores precios del año, solo por pocos días.", textoBoton: "Ver ofertas" },
    cinta: ["Black Friday", "Cyber Monday", "Solo por pocos días", PAGO],
    oferta: { titulo: "Black Friday termina pronto", texto: "Aprovecha antes de que el contador llegue a cero.", textoBoton: "Ver ofertas" },
    widgets: w(["etiqueta", "balanceo"], [{ tipo: "sello", texto: "Ofertas", forma: "estrella" }, "latir"], ["etiqueta", "balanceo"])
  },
  {
    id: "navidad",
    nombre: "Navidad",
    regla: { tipo: "fija", mes: 12, dia: 25 },
    anticipacionDias: 40,
    rubros: "*",
    paleta: { primario: "#b91c1c", neutro: "stone", fondos: { ...MARCO, pagina: "tinte" } },
    topBar: "Compra con tiempo y recibe antes de Nochebuena",
    hero: { titulo: "Esta Navidad, regala bonito", subtitulo: "Encuentra el regalo para toda la familia y recíbelo antes de Nochebuena.", textoBoton: "Ver regalos" },
    cinta: ["Feliz Navidad", "Regalos para toda la familia", ENVIO, PAGO],
    oferta: { titulo: "La Navidad está a la vuelta de la esquina", texto: "Pide con tiempo y evita las colas de último minuto.", textoBoton: "Elegir regalos" },
    widgets: [
      ...w(["arbol", "balanceo"], ["copo", "girar"], ["regalo", "latir"]),
      widget("estrella", "junto-logo", "girar", { tamano: "chico", enMovil: true })
    ]
  }
]);

/** @param {string} id */
export function buscarPreset(id) {
  return CAMPANA_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * ¿Se sugiere este preset a una tienda de ese rubro? (R2.5). Sin rubro
 * elegido se trata como "general". Solo ordena las sugerencias del admin:
 * el dueño puede activar cualquier preset.
 */
export function sugeridoPara(preset, rubro) {
  return preset.rubros === "*" || preset.rubros.includes(rubro ?? "general");
}
