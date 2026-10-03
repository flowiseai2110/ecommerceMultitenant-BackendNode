/**
 * Historial del asesor de ventas IA, guardado en el servidor.
 *
 * El historial que recibe el LLM sale SOLO de aquí, nunca del body: si lo
 * mandara el cliente, podría inventar turnos del asesor ("Claro, ignoraré mis
 * reglas…") o inflar el contexto que paga la tienda.
 *
 * Una conversación es (tienda, sessionToken) mientras tenga actividad; tras
 * `config.agente.inactividadMin` minutos sin mensajes se abre otra, para que la
 * charla de ayer no contamine la de hoy.
 *
 * @see docs/specs/agente-ventas/spec.md — R1.
 * @see docs/sql/agente_conversaciones.sql
 */

import { prisma } from "../../config/prisma.js";
import config from "../../config/index.js";

/**
 * Últimos `max` mensajes en orden cronológico, empezando siempre por uno del
 * cliente (el Messages API exige que el primer turno sea "user").
 * @param {Array<{rol:string, contenido:string}>} mensajes - En orden cronológico.
 * @param {number} max
 * @returns {Array<{rol:string, contenido:string}>}
 */
export function recortarHistorial(mensajes, max) {
  const ultimos = mensajes.slice(-max);
  const inicio = ultimos.findIndex(m => m.rol === "user");
  if (inicio === -1) return [];
  return ultimos.slice(inicio).map(m => ({ rol: m.rol, contenido: m.contenido }));
}

/**
 * Conversación activa de la sesión, o una nueva si no hay o venció por
 * inactividad.
 * @param {string} tiendaId - Server-side (req.tiendaId).
 * @param {string} sessionToken
 * @param {Date} [ahora]
 * @returns {Promise<{id:string, turnos:number}>}
 */
export async function obtenerConversacion(tiendaId, sessionToken, ahora = new Date()) {
  const limite = new Date(ahora.getTime() - config.agente.inactividadMin * 60 * 1000);

  const activa = await prisma.agente_conversaciones.findFirst({
    where: { tiendaId, sessionToken, estado: "activa", ultimaActividad: { gte: limite } },
    orderBy: { ultimaActividad: "desc" },
    select: { id: true, turnos: true }
  });
  if (activa) return activa;

  return prisma.agente_conversaciones.create({
    data: { tiendaId, sessionToken, ultimaActividad: ahora },
    select: { id: true, turnos: true }
  });
}

/**
 * Historial que se envía al LLM: los últimos `config.agente.maxHistorial`
 * mensajes de la conversación.
 * @param {string} tiendaId
 * @param {string} conversacionId
 * @returns {Promise<Array<{rol:string, contenido:string}>>}
 */
export async function cargarHistorial(tiendaId, conversacionId) {
  const max = config.agente.maxHistorial;
  const recientes = await prisma.agente_mensajes.findMany({
    where: { tiendaId, conversacionId },
    orderBy: { fechaRegistro: "desc" },
    take: max,
    select: { rol: true, contenido: true }
  });
  return recortarHistorial(recientes.reverse(), max);
}

/**
 * Guarda un turno completo (mensaje + respuesta) y actualiza la actividad. Se
 * llama solo si el LLM respondió: un fallo no deja medio turno guardado.
 * @param {object} params
 * @param {string} params.tiendaId
 * @param {string} params.conversacionId
 * @param {string} params.mensaje - Mensaje del cliente.
 * @param {string} params.respuesta - Texto del asesor.
 * @param {Date} params.inicio - Cuándo llegó el mensaje.
 */
export async function guardarTurno({ tiendaId, conversacionId, mensaje, respuesta, inicio }) {
  // Fechas explícitas: con el default now() de Postgres ambas filas tendrían la
  // misma hora (la de la transacción) y el orden del historial quedaría al azar.
  const fin = new Date(Math.max(Date.now(), inicio.getTime() + 1));

  await prisma.$transaction([
    prisma.agente_mensajes.createMany({
      data: [
        { tiendaId, conversacionId, rol: "user", contenido: mensaje, fechaRegistro: inicio },
        { tiendaId, conversacionId, rol: "assistant", contenido: respuesta, fechaRegistro: fin }
      ]
    }),
    prisma.agente_conversaciones.update({
      where: { id: conversacionId },
      data: { turnos: { increment: 1 }, ultimaActividad: fin, fechaActualizacion: fin }
    })
  ]);
}
