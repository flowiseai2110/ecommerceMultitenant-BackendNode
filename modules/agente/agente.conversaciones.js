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
 * @see docs/specs/agente-ventas/spec.md — R1, R8.
 * @see docs/sql/agente_conversaciones.sql
 */

import { prisma } from "../../config/prisma.js";
import config from "../../config/index.js";

// Mensajes que devuelve la recuperación de la conversación al reabrir el chat.
const MAX_MENSAJES_RECUPERADOS = 60;

const SELECT_CONVERSACION = { id: true, turnos: true, fallos: true };

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
 * Conversación con actividad reciente de la sesión, o null. No crea nada.
 * @param {string} tiendaId
 * @param {string} sessionToken
 * @param {Date} [ahora]
 * @returns {Promise<{id:string, turnos:number, fallos:number}|null>}
 */
export function obtenerConversacionActiva(tiendaId, sessionToken, ahora = new Date()) {
  const limite = new Date(ahora.getTime() - config.agente.inactividadMin * 60 * 1000);
  return prisma.agente_conversaciones.findFirst({
    where: { tiendaId, sessionToken, estado: "activa", ultimaActividad: { gte: limite } },
    orderBy: { ultimaActividad: "desc" },
    select: SELECT_CONVERSACION
  });
}

/**
 * Conversación activa de la sesión, o una nueva si no hay o venció por
 * inactividad.
 * @param {string} tiendaId - Server-side (req.tiendaId).
 * @param {string} sessionToken
 * @param {Date} [ahora]
 * @returns {Promise<{id:string, turnos:number, fallos:number}>}
 */
export async function obtenerConversacion(tiendaId, sessionToken, ahora = new Date()) {
  const activa = await obtenerConversacionActiva(tiendaId, sessionToken, ahora);
  if (activa) return activa;

  return prisma.agente_conversaciones.create({
    data: { tiendaId, sessionToken, ultimaActividad: ahora },
    select: SELECT_CONVERSACION
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
 * Mensajes de la conversación para volver a pintarlos al reabrir el chat, en
 * orden cronológico.
 * @param {string} tiendaId
 * @param {string} conversacionId
 * @returns {Promise<Array<{rol:string, contenido:string}>>}
 */
export async function listarMensajes(tiendaId, conversacionId) {
  const recientes = await prisma.agente_mensajes.findMany({
    where: { tiendaId, conversacionId },
    orderBy: { fechaRegistro: "desc" },
    take: MAX_MENSAJES_RECUPERADOS,
    select: { rol: true, contenido: true }
  });
  return recientes.reverse();
}

/**
 * Guarda un turno completo (mensaje + respuesta) y actualiza la actividad. Se
 * llama solo si hubo respuesta: un fallo del LLM no deja medio turno guardado.
 * @param {object} params
 * @param {string} params.tiendaId
 * @param {string} params.conversacionId
 * @param {string} params.mensaje - Mensaje del cliente.
 * @param {string} params.respuesta - Texto del asesor.
 * @param {Date} params.inicio - Cuándo llegó el mensaje.
 * @param {"sumar"|"reiniciar"|null} [params.fallo] - Cómo cambia el contador de
 *   fallos consecutivos; null lo deja igual (ej. un saludo).
 */
export async function guardarTurno({ tiendaId, conversacionId, mensaje, respuesta, inicio, fallo = null }) {
  // Fechas explícitas: con el default now() de Postgres ambas filas tendrían la
  // misma hora (la de la transacción) y el orden del historial quedaría al azar.
  const fin = new Date(Math.max(Date.now(), inicio.getTime() + 1));

  const data = { turnos: { increment: 1 }, ultimaActividad: fin, fechaActualizacion: fin };
  if (fallo === "sumar") data.fallos = { increment: 1 };
  if (fallo === "reiniciar") data.fallos = 0;

  await prisma.$transaction([
    prisma.agente_mensajes.createMany({
      data: [
        { tiendaId, conversacionId, rol: "user", contenido: mensaje, fechaRegistro: inicio },
        { tiendaId, conversacionId, rol: "assistant", contenido: respuesta, fechaRegistro: fin }
      ]
    }),
    prisma.agente_conversaciones.update({ where: { id: conversacionId }, data })
  ]);
}
