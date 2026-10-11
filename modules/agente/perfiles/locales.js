import { prisma } from "../../../config/prisma.js";
import { listarSalonesStore, obtenerSalonStore } from "../../reservas/locales/salones.service.js";
import { obtenerConfig } from "../../reservas/reservas.config.service.js";
import { fechaLima, horaLima } from "../../reservas/tiempo.js";

/**
 * Perfil del asesor para un local de eventos (alquiler-locales).
 *
 * Mismas reglas que los otros asesores: tool-use, tiendaId del servidor, sin
 * montos en el texto (las tarjetas muestran el precio "desde" real). La fecha
 * libre y el precio exacto salen del calendario y la cotización de la ficha del
 * salón, así que el asesor NUNCA afirma que una fecha está libre: lleva a la ficha.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MAX_SALONES = 4;

export function systemPromptLocales(nombre, ahora = new Date()) {
  const hoy = fechaLima(ahora);
  const dia = DIAS[new Date(`${hoy}T00:00:00Z`).getUTCDay()];
  return [
    `Eres el asesor de "${nombre || "el local"}", un local de eventos. Ayudas a elegir el salón para un`,
    "quinceaños, cumpleaños, boda, promoción o evento corporativo, y a cotizar o separar la fecha, con trato",
    "cercano y honesto. Responde en el idioma del cliente.",
    "",
    `Hoy es ${dia} ${hoy.split("-").reverse().join("/")}, son las ${horaLima(ahora)} (hora de Lima).`,
    "",
    "Reglas:",
    "- Usa ver_salones cuando pregunten por salones, aforo, turnos, paquetes, servicios o precios.",
    "- Solo menciona salones que la herramienta devuelva.",
    "- NUNCA afirmes que una fecha está libre: el calendario de la ficha del salón muestra las fechas libres y",
    "  ahí se cotiza al instante. Si preguntan \"¿tienen el 5 de diciembre?\", invita a abrir la tarjeta y elegir la fecha.",
    "- Para cómo se separa la fecha, cuotas, garantía, cancelación, proveedores propios u horario tope, usa info_local.",
    "- La interfaz muestra las tarjetas con el precio real. NUNCA escribas precios, montos ni monedas:",
    "  usa los indicadores (es_el_mas_economico, entra_tu_grupo).",
    "- Nunca pidas datos de tarjeta ni documentos: se ingresan en la solicitud.",
    "- Tu texto: máximo 2 frases, sin listas. Si falta un dato clave (cuántos invitados o qué evento), pregunta uno.",
    "",
    "Ejemplo: \"Para 80 invitados te recomiendo el Salón Imperial; tiene turno noche y paquete con buffet. Abre la tarjeta, elige tu fecha y cotiza al instante.\""
  ].join("\n");
}

export const toolsLocales = [
  {
    name: "ver_salones",
    description:
      "Lista los salones del local con su aforo, metros, servicios, turnos (horarios) y paquetes (qué incluyen). " +
      "Úsala para recomendar o responder sobre salones. No informa qué fechas están libres.",
    input_schema: {
      type: "object",
      properties: {
        invitados: { type: "integer", minimum: 1, maximum: 5000, description: "Si el cliente dijo cuántos invitados son." }
      }
    }
  },
  {
    name: "info_local",
    description:
      "Datos del local: cómo se separa la fecha, en cuántas cuotas se paga el resto, garantía, política de " +
      "cancelación, reprogramaciones, si se permiten proveedores propios, horario tope y dirección.",
    input_schema: { type: "object", properties: {} }
  }
];

const legible = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/**
 * @returns {Promise<{ paraModelo: object, tarjetas: Array }>} tarjetas con la
 *   forma de las de productos (serializeProductoCardChat) + `ruta` a la ficha.
 */
export async function ejecutarToolLocales(nombre, input, { tiendaId }) {
  if (nombre === "info_local") {
    const [c, tienda] = await Promise.all([
      obtenerConfig(tiendaId),
      prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { direccion: true } })
    ]);
    return {
      tarjetas: [],
      paraModelo: {
        confirmacion: c.modoConfirmacion === "pago_directo"
          ? "El cliente acepta el contrato y paga la separación al reservar; con eso la fecha queda bloqueada."
          : "El cliente envía la solicitud, la fecha queda apartada mientras el local responde y, si acepta, recibe el contrato y el plan de pagos.",
        separacion: c.separacionTipo === "monto_fijo"
          ? "Se separa la fecha con un monto fijo (lo muestra la cotización)."
          : `Se separa la fecha con el ${c.adelantoPct}% del total.`,
        cuotas_maximas: c.maxCuotas,
        saldo_dias_antes_del_evento: c.saldoDiasAntes,
        pide_garantia: Number(c.garantiaMonto) > 0,
        devolucion_garantia_dias: c.garantiaDevolucionDias,
        cancelacion_por_tramos: (c.politicaTramos ?? []).map(t => ({
          desde_dias_antes: t.desdeDias, devuelve_pct_de_lo_pagado: t.restoPct, devuelve_pct_de_la_separacion: t.separacionPct
        })),
        reprogramaciones_permitidas: c.reprogramacionesMax,
        reprogramar_con_dias_de_anticipacion: c.reprogramacionMinDias,
        proveedores_propios: c.proveedoresExternos,
        hora_tope: c.horaTope,
        cotizacion_vigente_dias: c.cotizacionVigenciaDias,
        politica_cancelacion: c.politicaCancelacion,
        instrucciones: c.instrucciones,
        direccion: tienda?.direccion ?? null
      }
    };
  }

  let salones = await listarSalonesStore(tiendaId);
  const invitados = Number.isInteger(input?.invitados) ? input.invitados : null;
  if (invitados) salones = salones.filter(s => !s.aforoMaximo || s.aforoMaximo >= invitados);
  // La ficha trae turnos y paquetes (el listado no).
  const fichas = await Promise.all(salones.slice(0, MAX_SALONES).map(s => obtenerSalonStore(tiendaId, s.slug)));

  const minimo = Math.min(...fichas.map(s => s.desde ?? Infinity));
  return {
    tarjetas: fichas.map(s => ({
      id: s.id,
      nombre: s.nombre,
      slug: s.slug,
      precioBase: s.desde ?? 0,
      precioOferta: null,
      stock: 1,
      imagenUrl: s.imagenes[0]?.url ?? null,
      imagenAlt: s.imagenes[0]?.alt ?? s.nombre,
      ruta: `salones/${s.slug}`
    })),
    paraModelo: {
      salones: fichas.map(s => ({
        nombre: s.nombre,
        aforo_maximo: s.aforoMaximo,
        metros: s.metros,
        servicios: (s.servicios ?? []).map(legible),
        se_alquila_por_horas: s.porHoras,
        turnos: (s.turnos ?? []).map(t => `${t.nombre} (${t.horaInicio}–${t.horaFin})`),
        paquetes: (s.paquetes ?? []).map(p => ({ nombre: p.nombre, incluye: p.incluye ?? [], es_promocion: p.esPromocion })),
        entra_tu_grupo: invitados ? !s.aforoMaximo || s.aforoMaximo >= invitados : null,
        es_el_mas_economico: fichas.length > 1 && s.desde === minimo
      }))
    }
  };
}

/** Perfil del asesor de este rubro (estrategia.agente, modules/negocio/registro.js). */
export const agenteLocales = {
  system: systemPromptLocales, tools: toolsLocales, ejecutar: ejecutarToolLocales,
  busqueda: "ver_salones", saludo: "¿Qué evento estás organizando?"
};
