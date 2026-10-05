import { prisma } from "../../../config/prisma.js";
import { listarToursStore } from "../../reservas/tours/tours.service.js";
import { diaTour } from "../../reservas/tours/cotizar.js";
import { cierresPublicos } from "../../reservas/cierres.service.js";
import { obtenerConfig } from "../../reservas/reservas.config.service.js";
import { fechaLima, horaLima } from "../../reservas/tiempo.js";

/**
 * Perfil del asesor para una agencia de tours (mini booking, spec R13).
 *
 * Mismas reglas que los otros perfiles: tool-use, tiendaId del servidor, sin
 * montos en el texto. La agencia confirma cada salida, así que el asesor NUNCA
 * afirma cupo; sí puede decir qué días sale un tour y si una fecha está cerrada.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MS_DIA = 24 * 60 * 60 * 1000;

export function systemPromptTours(nombre, ahora = new Date()) {
  const hoy = fechaLima(ahora);
  const dia = DIAS[new Date(`${hoy}T00:00:00Z`).getUTCDay()];
  return [
    `Eres el asesor de reservas de "${nombre || "la agencia"}". Ayudas a elegir un tour y a enviar la solicitud`,
    "de reserva, con trato cercano y honesto. Responde en el idioma del cliente.",
    "",
    `Hoy es ${dia} ${hoy.split("-").reverse().join("/")}, son las ${horaLima(ahora)} (hora de Lima).`,
    "",
    "Reglas:",
    "- Usa buscar_tours cuando pregunten por tours, destinos, precios, duración, qué incluye o qué días salen.",
    "  Si mencionan un día (\"este sábado\", \"mañana\"), pásalo como fecha YYYY-MM-DD.",
    "- Solo menciona tours que la herramienta devuelva.",
    "- NUNCA afirmes que hay cupo: la agencia lo confirma al recibir la solicitud. Sí puedes decir qué días",
    "  sale un tour y si la fecha pedida no tiene salida o está cerrada.",
    "- Para forma de pago, adelanto, política de cancelación o instrucciones, usa info_agencia.",
    "- La interfaz muestra las tarjetas con el precio real. NUNCA escribas precios, montos ni monedas:",
    "  usa los indicadores (es_el_mas_economico, es_de_los_mas_pedidos).",
    "- Nunca pidas datos de tarjeta ni documentos: se ingresan en el formulario de la solicitud.",
    "- Tu texto: máximo 2 frases, sin listas. Si falta un dato clave (destino o fecha), pregunta uno.",
    "",
    "Ejemplo: \"Para este sábado te recomiendo Islas Ballestas; sale a las 8:00 y dura 2 horas. Elige la salida en la tarjeta y envía la solicitud.\""
  ].join("\n");
}

export const toolsTours = [
  {
    name: "buscar_tours",
    description:
      "Lista los tours de la agencia con duración, días y horas de salida, idiomas, qué incluye y edad mínima. " +
      "Con `fecha`, indica si ese día hay salida. Con orden \"populares\", los más pedidos de los últimos 90 días. " +
      "No informa cupo.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Destino o palabra clave (\"Paracas\", \"cañón\", \"full day\")." },
        fecha: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Día que pidió el cliente (YYYY-MM-DD)." },
        orden: { type: "string", enum: ["populares", "precio"], description: "populares por defecto." }
      }
    }
  },
  {
    name: "info_agencia",
    description:
      "Datos de la agencia: cómo se paga (total o adelanto y saldo en destino), política de cancelación, " +
      "instrucciones para la salida y dirección.",
    input_schema: { type: "object", properties: {} }
  }
];

/** Reservas confirmadas por tour en los últimos 90 días (spec R13.1). */
async function pedidosPorTour(tiendaId, ahora) {
  const filas = await prisma.reservas.groupBy({
    by: ["productoId"],
    where: {
      tiendaId,
      tipo: "tour",
      pedido: { estado: { in: ["confirmada", "completada"] }, fechaRegistro: { gte: new Date(ahora.getTime() - 90 * MS_DIA) } }
    },
    _count: { _all: true }
  });
  return new Map(filas.map(f => [f.productoId, f._count._all]));
}

const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const coincide = (tour, texto) => {
  const q = normalizar(texto);
  return [tour.nombre, tour.descripcionCorta, tour.duracion].some(v => v && normalizar(v).includes(q));
};

/**
 * @returns {Promise<{ paraModelo: object, tarjetas: Array }>} tarjetas con la
 *   forma de las de productos + `ruta` a la ficha del tour.
 */
export async function ejecutarToolTours(nombre, input, { tiendaId, ahora = new Date() }) {
  if (nombre === "info_agencia") {
    const [c, tienda] = await Promise.all([
      obtenerConfig(tiendaId),
      prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { direccion: true } })
    ]);
    return {
      tarjetas: [],
      paraModelo: {
        confirmacion: c.modoConfirmacion === "pago_directo"
          ? "El cliente paga al enviar la solicitud y la agencia confirma al verificar el pago."
          : "La agencia confirma la salida y luego el cliente paga por Yape, Plin o transferencia y sube su captura.",
        cobro: { total: "se paga el total al confirmar", adelanto: `se paga un adelanto del ${c.adelantoPct}% al confirmar y el saldo en destino`, en_destino: "se paga en destino" }[c.cobro],
        politica_cancelacion: c.politicaCancelacion,
        instrucciones: c.instrucciones,
        direccion: tienda?.direccion ?? null
      }
    };
  }

  let tours = await listarToursStore(tiendaId);
  const texto = typeof input?.texto === "string" ? input.texto.trim() : "";
  if (texto) {
    const filtrados = tours.filter(t => coincide(t, texto));
    // Sin coincidencias se muestran todos: mejor ofrecer algo que una lista vacía.
    if (filtrados.length) tours = filtrados;
  }

  const fecha = typeof input?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ? input.fecha : null;
  const cierres = fecha ? await cierresPublicos(tiendaId, { desde: fecha, hasta: fecha }) : [];
  const cerrado = (t) => cierres.some(c => c.productoId === null || c.productoId === t.id);

  const pedidos = await pedidosPorTour(tiendaId, ahora);
  const orden = input?.orden === "precio" ? "precio" : "populares";
  tours = [...tours].sort((a, b) => (orden === "precio"
    ? (a.desde?.precio ?? Infinity) - (b.desde?.precio ?? Infinity)
    : (pedidos.get(b.id) ?? 0) - (pedidos.get(a.id) ?? 0) || Number(b.destacado) - Number(a.destacado)));
  tours = tours.slice(0, 4);

  const minimo = Math.min(...tours.map(t => t.desde?.precio ?? Infinity));
  const maxPedidos = Math.max(0, ...tours.map(t => pedidos.get(t.id) ?? 0));
  return {
    tarjetas: tours.map(t => ({
      id: t.id,
      nombre: t.nombre,
      slug: t.slug,
      precioBase: t.desde?.precio ?? 0,
      precioOferta: null,
      stock: 1,
      imagenUrl: t.imagenes[0]?.url ?? null,
      imagenAlt: t.imagenes[0]?.alt ?? t.nombre,
      ruta: `tours/${t.slug}`
    })),
    paraModelo: {
      tours: tours.map(t => ({
        nombre: t.nombre,
        resumen: t.descripcionCorta,
        duracion: t.duracion,
        dias_salida: t.diasSalidaTexto,
        horas_salida: t.horasSalida,
        idiomas: t.idiomas,
        edad_minima: t.edadMinima,
        ...(fecha ? {
          sale_ese_dia: t.diasSalida.includes(diaTour(fecha)) && !cerrado(t),
          ...(cerrado(t) ? { fecha_cerrada: true } : {})
        } : {}),
        es_el_mas_economico: tours.length > 1 && t.desde?.precio === minimo,
        es_de_los_mas_pedidos: maxPedidos > 0 && (pedidos.get(t.id) ?? 0) === maxPedidos
      }))
    }
  };
}
