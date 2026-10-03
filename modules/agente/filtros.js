/**
 * Capas 1 y 2 del asesor: lo que se resuelve con código, sin LLM y sin gastar
 * una consulta del plan de la tienda (basura, saludos, datos de tarjeta).
 *
 * Funciones puras. El controller decide qué hacer con el resultado.
 *
 * @see docs/specs/agente-ventas/spec.md — R5.
 */

export const PLANTILLA = Object.freeze({ PAGO: "pago", BASURA: "basura", SALUDO: "saludo", PERSONA: "persona" });

// Plantillas que cuentan como fallo de la conversación (R8.2).
export const PLANTILLAS_FALLO = new Set([PLANTILLA.BASURA, PLANTILLA.PERSONA]);

// Minúsculas, sin tildes ni signos: "¡Hola, buenas!" → "hola buenas".
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mensaje sin contenido útil: "532 3%& '34", "jjjjj", "???".
 * Un número corto solo NO es basura: puede ser la respuesta a "¿qué talla?"
 * o "¿cuál es tu presupuesto?" ("40", "200").
 * @param {string} texto
 * @returns {boolean}
 */
export function esBasura(texto) {
  const limpio = normalizar(texto);
  if (/^\d{1,6}$/.test(limpio)) return false;

  const letras = limpio.replace(/[^a-zñ]/g, "");
  if (letras.length === 0) return true;
  // Varias letras sin una sola vocal no forman palabras ("jjjj", "xkcd qwrt").
  // Una o dos letras sueltas sí pueden ser algo ("q", "ok" tiene vocal).
  return letras.length >= 3 && !/[aeiouy]/.test(letras);
}

const SALUDOS = new Set([
  "hola", "holi", "holis", "ola", "alo", "hey", "hi", "hello", "saludos",
  "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches",
  "que tal", "como estas", "como esta"
]);

/**
 * El mensaje es SOLO un saludo ("hola", "¡Buenas tardes!", "hola, qué tal").
 * "hola, busco zapatillas" no: ese ya trae lo que necesita el asesor.
 * @param {string} texto
 * @returns {boolean}
 */
export function esSaludo(texto) {
  let resto = normalizar(texto);
  if (!resto) return false;
  // Consume saludos del inicio, del más largo al más corto ("buenas tardes" antes que "buenas").
  const ordenados = [...SALUDOS].sort((a, b) => b.length - a.length);
  let consumio = true;
  while (resto && consumio) {
    consumio = false;
    for (const s of ordenados) {
      if (resto === s || resto.startsWith(`${s} `)) {
        resto = resto.slice(s.length).trim();
        consumio = true;
        break;
      }
    }
  }
  return resto === "";
}

// "hablar con una persona", "quiero un asesor humano", "no me entiendes".
const PIDE_PERSONA = [
  /\b(hablar|conversar|comunicarme|chatear)\s+con\s+(una?\s+|alguien\s*|el\s+|la\s+)?(persona|humano|asesor|asesora|vendedor|vendedora|alguien|encargado|encargada)\b/,
  /\b(quiero|necesito|pasame|paseme|comunicame)\s+(con\s+)?(una?\s+)?(persona|humano|asesor|asesora)\s*(real|humano|humana)?\b/,
  /\b(asesor|agente|persona)\s+(real|humano|humana)\b/,
  /\bno\s+(me\s+)?(entiendes|entiende|estas\s+entendiendo)\b/
];

/**
 * El cliente pide una persona o dice que el asesor no lo entiende.
 * @param {string} texto
 * @returns {boolean}
 */
export function pidePersona(texto) {
  const limpio = normalizar(texto);
  return PIDE_PERSONA.some(re => re.test(limpio));
}

// Luhn: descarta números largos que no son tarjetas (teléfonos, DNI, pedidos).
function pasaLuhn(digitos) {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

/**
 * Oculta números de tarjeta (13–19 dígitos, con o sin espacios/guiones, que
 * pasan Luhn) antes de guardar el mensaje o mandarlo a un tercero.
 * @param {string} texto
 * @returns {{ texto: string, oculto: boolean }}
 */
export function enmascararPagos(texto) {
  let oculto = false;
  const resultado = texto.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match) => {
    const digitos = match.replace(/\D/g, "");
    if (digitos.length < 13 || digitos.length > 19 || !pasaLuhn(digitos)) return match;
    oculto = true;
    return "[tarjeta oculta]";
  });
  return { texto: resultado, oculto };
}

/**
 * Decide si el mensaje se responde con plantilla. Siempre devuelve el texto
 * enmascarado: es el que se guarda y, si no hay plantilla, el que va al LLM.
 * @param {string} mensaje
 * @returns {{ texto: string, plantilla: "pago"|"basura"|"saludo"|"persona"|null }}
 */
export function clasificarMensaje(mensaje) {
  const { texto, oculto } = enmascararPagos(mensaje);
  if (oculto) return { texto, plantilla: PLANTILLA.PAGO };
  if (esBasura(texto)) return { texto, plantilla: PLANTILLA.BASURA };
  if (pidePersona(texto)) return { texto, plantilla: PLANTILLA.PERSONA };
  if (esSaludo(texto)) return { texto, plantilla: PLANTILLA.SALUDO };
  return { texto, plantilla: null };
}

/**
 * Texto de cada plantilla. El saludo dice que es un asistente de IA, que
 * responde al toque y que puede pasar con una persona (spec: rechazo de usuarios, punto 10).
 * @param {"pago"|"basura"|"saludo"|"persona"} plantilla
 * @param {{ tiendaNombre?: string, conWhatsapp?: boolean }} [ctx]
 * @returns {string}
 */
export function textoPlantilla(plantilla, { tiendaNombre, conWhatsapp = false } = {}) {
  const tienda = tiendaNombre || "la tienda";
  switch (plantilla) {
    case PLANTILLA.PERSONA:
      return conWhatsapp
        ? "Claro 🙂 Toca «Hablar con una persona»: se abre WhatsApp con el resumen de lo que " +
          "conversamos, así no tienes que repetirlo."
        : "Por ahora no puedo pasarte con una persona desde aquí. Encuentras los datos de " +
          "contacto de la tienda al pie de la página.";
    case PLANTILLA.PAGO:
      return "Por seguridad oculté ese número 🔒 Nunca escribas datos de tu tarjeta en el chat: " +
        "el pago se hace solo en el checkout oficial de la tienda.";
    case PLANTILLA.BASURA:
      return "No te entendí 🙂 Cuéntame qué buscas: el producto, la talla o tu presupuesto.";
    case PLANTILLA.SALUDO:
      return `¡Hola! Soy el asistente virtual de ${tienda} 🤖 Te respondo al toque a cualquier hora ` +
        "y, si lo prefieres, te paso con una persona. ¿Qué estás buscando?";
    default:
      throw new Error(`Plantilla desconocida: ${plantilla}`);
  }
}
