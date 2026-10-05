import { prisma } from "../../../config/prisma.js";
import { listarEventosStore, obtenerEventoStore } from "../../reservas/eventos/eventos.service.js";
import { obtenerConfig } from "../../reservas/reservas.config.service.js";
import { fechaLima, horaLima } from "../../reservas/tiempo.js";

/**
 * Perfil del asesor para un organizador de eventos (mini booking, spec R13).
 *
 * A diferencia de hotel y tours, el cupo de eventos es real: el asesor sí puede
 * decir si quedan entradas ("disponible", "últimas", "agotado"), pero nunca
 * escribe precios ni cuántas quedan exactamente (lo muestran las tarjetas).
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ESTADOS = { disponible: "hay entradas", ultimas: "últimas entradas", agotado: "agotado", cerrado: "venta cerrada" };

const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cuando = (iso) => {
  const d = new Date(iso);
  return `${DIAS[new Date(`${fechaLima(d)}T00:00:00Z`).getUTCDay()]} ${fechaLima(d).split("-").reverse().join("/")} ${horaLima(d)}`;
};

export function systemPromptEventos(nombre, ahora = new Date()) {
  const hoy = fechaLima(ahora);
  const dia = DIAS[new Date(`${hoy}T00:00:00Z`).getUTCDay()];
  return [
    `Eres el asesor de "${nombre || "la tienda de entradas"}". Ayudas a encontrar un evento y a comprar entradas,`,
    "con trato cercano y honesto. Responde en el idioma del cliente.",
    "",
    `Hoy es ${dia} ${hoy.split("-").reverse().join("/")}, son las ${horaLima(ahora)} (hora de Lima).`,
    "",
    "Reglas:",
    "- Usa ver_eventos cuando pregunten por eventos, fechas, funciones, lugar, edad mínima o si quedan entradas.",
    "- Solo menciona eventos que la herramienta devuelva.",
    "- El estado de las entradas es real: puedes decir si hay entradas, si son las últimas o si está agotado.",
    "  Nunca digas cuántas quedan exactamente.",
    "- La compra aparta las entradas mientras el cliente paga por Yape o transferencia y sube su captura;",
    "  el organizador verifica el pago y confirma. Para más detalles usa info_organizador.",
    "- La interfaz muestra las tarjetas con el precio real. NUNCA escribas precios, montos ni monedas.",
    "- Nunca pidas datos de tarjeta ni documentos: se ingresan en el formulario de compra.",
    "- Tu texto: máximo 2 frases, sin listas. Si falta un dato clave (qué evento o qué día), pregunta uno.",
    "",
    "Ejemplo: \"Para el sábado hay función del Stand Up a las 20:00 y quedan las últimas entradas. Elige tu entrada en la tarjeta.\""
  ].join("\n");
}

export const toolsEventos = [
  {
    name: "ver_eventos",
    description:
      "Lista los próximos eventos con sus funciones (fecha y hora), lugar, edad mínima y el estado de cada tipo " +
      "de entrada (hay entradas / últimas / agotado / venta cerrada). Úsala para recomendar o responder sobre eventos.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Nombre del evento, artista o palabra clave." },
        fecha: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Día que pidió el cliente (YYYY-MM-DD)." }
      }
    }
  },
  {
    name: "info_organizador",
    description: "Cómo se paga y confirma la compra, cuánto tiempo se apartan las entradas, política de cancelación e instrucciones.",
    input_schema: { type: "object", properties: {} }
  }
];

/**
 * @returns {Promise<{ paraModelo: object, tarjetas: Array }>} tarjetas con la
 *   forma de las de productos + `ruta` a la ficha del evento.
 */
export async function ejecutarToolEventos(nombre, input, { tiendaId, ahora = new Date() }) {
  if (nombre === "info_organizador") {
    const [c, tienda] = await Promise.all([
      obtenerConfig(tiendaId),
      prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { direccion: true } })
    ]);
    return {
      tarjetas: [],
      paraModelo: {
        compra: "Al comprar, las entradas quedan apartadas. El cliente paga por Yape, Plin o transferencia, sube su captura y el organizador confirma al verificar el pago.",
        minutos_para_pagar: c.apartadoManualMin,
        maximo_entradas_por_compra: c.maxEntradasPorCompra,
        cierre_venta_en_linea: c.cierrePagoManualHoras ? `${c.cierrePagoManualHoras} horas antes de cada función` : "hasta el inicio de la función",
        ingreso: "Se presenta el código de compra y el documento del titular en la puerta.",
        politica_cancelacion: c.politicaCancelacion,
        instrucciones: c.instrucciones,
        direccion: tienda?.direccion ?? null
      }
    };
  }

  let eventos = await listarEventosStore(tiendaId, ahora);
  const texto = typeof input?.texto === "string" ? normalizar(input.texto.trim()) : "";
  if (texto) {
    const filtrados = eventos.filter(e => [e.nombre, e.descripcionCorta, e.lugar].some(v => v && normalizar(v).includes(texto)));
    if (filtrados.length) eventos = filtrados;
  }
  const fecha = typeof input?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ? input.fecha : null;
  if (fecha) {
    const delDia = eventos.filter(e => e.funciones.some(f => fechaLima(new Date(f.inicio)) === fecha));
    if (delDia.length) eventos = delDia;
  }
  eventos = eventos.slice(0, 4);

  // La ficha trae el estado por tipo de entrada; la lista solo el de la función.
  const fichas = await Promise.all(eventos.map(e => obtenerEventoStore(tiendaId, e.slug, ahora)));

  return {
    tarjetas: fichas.map(e => ({
      id: e.id,
      nombre: e.nombre,
      slug: e.slug,
      precioBase: e.desde?.precio ?? 0,
      precioOferta: null,
      stock: e.agotado ? 0 : 1,
      imagenUrl: e.imagenes[0]?.url ?? null,
      imagenAlt: e.imagenes[0]?.alt ?? e.nombre,
      ruta: `eventos/${e.slug}`
    })),
    paraModelo: {
      ...(fecha && !fichas.some(e => e.funciones.some(f => fechaLima(new Date(f.inicio)) === fecha))
        ? { nota: "No hay funciones ese día; estos son los próximos eventos." } : {}),
      eventos: fichas.map(e => ({
        nombre: e.nombre,
        resumen: e.descripcionCorta,
        lugar: e.lugar,
        edad_minima: e.edadMinima,
        funciones: e.funciones.slice(0, 5).map(f => ({
          cuando: cuando(f.inicio),
          ...(f.nombre ? { nombre: f.nombre } : {}),
          entradas: f.tipos.map(t => ({ tipo: t.nombre, estado: ESTADOS[t.estado] }))
        }))
      }))
    }
  };
}
