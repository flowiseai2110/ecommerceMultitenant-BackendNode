import { prisma } from "../../../config/prisma.js";
import { listarHabitacionesStore } from "../../reservas/hotel/habitaciones.service.js";
import { obtenerConfig } from "../../reservas/reservas.config.service.js";
import { fechaLima, horaLima } from "../../reservas/tiempo.js";

/**
 * Perfil del asesor para un hotel / hostal (mini booking, spec R13).
 *
 * Mismas reglas que el asesor de productos: tool-use, tiendaId del servidor,
 * sin montos en el texto (las tarjetas muestran el precio real). La diferencia:
 * el hotel confirma la disponibilidad, así que el asesor NUNCA la afirma; lleva
 * a la solicitud con la habitación elegida.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function systemPromptHotel(nombre, ahora = new Date()) {
  const hoy = fechaLima(ahora);
  const dia = DIAS[new Date(`${hoy}T00:00:00Z`).getUTCDay()];
  return [
    `Eres el asesor de reservas de "${nombre || "el hotel"}". Ayudas a elegir habitación y a enviar la solicitud`,
    "de reserva, con trato cercano y honesto. Responde en el idioma del cliente.",
    "",
    `Hoy es ${dia} ${hoy.split("-").reverse().join("/")}, son las ${horaLima(ahora)} (hora de Lima).`,
    "",
    "Reglas:",
    "- Usa ver_habitaciones cuando pregunten por habitaciones, precios, tarifas por horas o por noche, capacidad o camas.",
    "- Solo menciona habitaciones que la herramienta devuelva.",
    "- NUNCA afirmes que hay disponibilidad: el hotel la confirma al recibir la solicitud. Si preguntan",
    "  \"¿hay para hoy a las 7?\", explica que envíen la solicitud desde la tarjeta y el hotel les confirma.",
    "- Las estadías por horas son una ventana fija desde la hora de ingreso: llegar tarde no corre la salida.",
    "- Para horarios de check-in/check-out, política de cancelación, forma de pago o cómo llegar, usa info_hotel.",
    "- La interfaz muestra las tarjetas con el precio real. NUNCA escribas precios, montos ni monedas:",
    "  usa los indicadores (es_la_mas_economica, tiene_tarifa_por_horas).",
    "- Nunca pidas datos de tarjeta ni documentos: se ingresan en el formulario de la solicitud.",
    "- Tu texto: máximo 2 frases, sin listas. Si falta un dato clave (personas, noche o por horas), pregunta uno.",
    "",
    "Ejemplo: \"Para 2 personas te recomiendo la Matrimonial; tiene tarifa de 6 horas. Elige tu hora en la tarjeta y envía la solicitud.\""
  ].join("\n");
}

export const toolsHotel = [
  {
    name: "ver_habitaciones",
    description:
      "Lista las habitaciones del hotel con su capacidad, camas, servicios y modalidades (por noche y/o por " +
      "bloques de horas). Úsala para recomendar o responder sobre habitaciones y tarifas. No informa disponibilidad.",
    input_schema: {
      type: "object",
      properties: {
        personas: { type: "integer", minimum: 1, maximum: 20, description: "Si el cliente dijo cuántas personas son." },
        modalidad: { type: "string", enum: ["noche", "horas"], description: "Si pidió por noche o por horas." }
      }
    }
  },
  {
    name: "info_hotel",
    description:
      "Datos del hotel: horarios de check-in y check-out, política de cancelación, cómo se paga la reserva, " +
      "instrucciones para la llegada y dirección.",
    input_schema: { type: "object", properties: {} }
  }
];

/**
 * @returns {Promise<{ paraModelo: object, tarjetas: Array }>} tarjetas con la
 *   forma de las de productos (serializeProductoCardChat) + `ruta` a la ficha.
 */
export async function ejecutarToolHotel(nombre, input, { tiendaId }) {
  if (nombre === "info_hotel") {
    const [c, tienda] = await Promise.all([
      obtenerConfig(tiendaId),
      prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { direccion: true } })
    ]);
    return {
      tarjetas: [],
      paraModelo: {
        hora_checkin: c.horaCheckin,
        hora_checkout: c.horaCheckout,
        confirmacion: c.modoConfirmacion === "pago_directo"
          ? "El cliente paga al enviar la solicitud y el hotel confirma al verificar el pago."
          : "El hotel confirma la disponibilidad y luego el cliente paga por Yape, Plin o transferencia y sube su captura.",
        cobro: { total: "se paga el total al confirmar", adelanto: `se paga un adelanto del ${c.adelantoPct}% al confirmar`, en_destino: "se paga en el hotel" }[c.cobro],
        comprobante: c.comprobanteEn === "en_el_servicio" ? "La boleta o factura se entrega al finalizar la estadía, con los consumos." : "El comprobante se entrega al confirmar el pago.",
        politica_cancelacion: c.politicaCancelacion,
        instrucciones: c.instrucciones,
        direccion: tienda?.direccion ?? null
      }
    };
  }

  let habitaciones = await listarHabitacionesStore(tiendaId);
  const personas = Number.isInteger(input?.personas) ? input.personas : null;
  if (personas) habitaciones = habitaciones.filter(h => h.capacidadMax >= personas);
  if (input?.modalidad) habitaciones = habitaciones.filter(h => h.modalidades.some(m => m.tipo === input.modalidad));
  habitaciones = habitaciones.slice(0, 4);

  const minimo = Math.min(...habitaciones.map(h => h.desde?.precio ?? Infinity));
  return {
    tarjetas: habitaciones.map(h => ({
      id: h.id,
      nombre: h.nombre,
      slug: h.slug,
      precioBase: h.desde?.precio ?? 0,
      precioOferta: null,
      stock: 1,
      imagenUrl: h.imagenes[0]?.url ?? null,
      imagenAlt: h.imagenes[0]?.alt ?? h.nombre,
      ruta: `habitaciones/${h.slug}`
    })),
    paraModelo: {
      habitaciones: habitaciones.map(h => ({
        nombre: h.nombre,
        capacidad_personas: h.capacidadMax,
        admite_ninos: h.capacidadNinos > 0,
        camas: h.camas,
        servicios: h.amenities,
        modalidades: h.modalidades.map(m => m.etiqueta),
        tiene_tarifa_por_horas: h.modalidades.some(m => m.tipo === "horas"),
        precio_por_persona: h.porPersona,
        es_la_mas_economica: habitaciones.length > 1 && h.desde?.precio === minimo
      }))
    }
  };
}
