import { prisma } from "../../config/prisma.js";
import { duracionEfectiva, minutosADescontar, periodoTransmision } from "./transmisiones.reglas.js";

/**
 * Horas de transmisión del plan Privado (R7, versión simple de la Fase 2):
 * solo las horas incluidas en el plan mensual de la tienda (no se acumulan).
 * Los paquetes prepagados y el excedente llegan en la Fase 3.
 *
 * Todo se cuenta en minutos "de paquete" (minutos × factor del tope):
 *   incluidas  = planes.horas_transmision_mes × 60
 *   usadas     = tienda_uso_recursos (recurso transmision_minutos) del mes
 *   reservadas = transmisiones programadas del mes que todavía no terminan
 *   disponibles = incluidas − usadas − reservadas
 * El mes es el del inicio de la función (hora de Lima).
 */

export const RECURSO = "transmision_minutos";

async function incluidasMin(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { plan: { select: { horasTransmisionMes: true } } } });
  return (tienda?.plan?.horasTransmisionMes ?? 0) * 60;
}

/**
 * @param {{ excluirId?: string }} [opts] - transmisión que no cuenta como reservada (la que se está viendo).
 * @returns {Promise<{ periodo: string, incluidasMin: number, usadasMin: number, reservadasMin: number, disponiblesMin: number }>}
 */
export async function saldoHoras(tiendaId, periodo, { excluirId } = {}) {
  const [incluidas, uso, pendientes] = await Promise.all([
    incluidasMin(tiendaId),
    prisma.tienda_uso_recursos.findUnique({
      where: { uq_tienda_recurso_periodo: { tiendaId, recurso: RECURSO, periodo } },
      select: { cantidadUsada: true }
    }),
    prisma.evento_transmisiones.findMany({
      where: { tiendaId, plan: { not: "basico" }, estado: "programada", terminadaEn: null, ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: { duracionMin: true, factor: true, funcion: { select: { inicio: true, fin: true } } }
    })
  ]);
  const usadas = uso?.cantidadUsada ?? 0;
  const reservadas = pendientes
    .filter(t => periodoTransmision(t.funcion) === periodo)
    .reduce((s, t) => s + minutosADescontar(duracionEfectiva(t, t.funcion), t.factor ?? 1), 0);
  return {
    periodo,
    incluidasMin: incluidas,
    usadasMin: usadas,
    reservadasMin: reservadas,
    disponiblesMin: Math.max(0, incluidas - usadas - reservadas)
  };
}

/** Suma los minutos descontados de una transmisión al uso del mes (dentro de la transacción del corte). */
export async function registrarConsumo(tx, tiendaId, periodo, minutos) {
  const incluidas = await incluidasMin(tiendaId);
  await tx.tienda_uso_recursos.upsert({
    where: { uq_tienda_recurso_periodo: { tiendaId, recurso: RECURSO, periodo } },
    create: { tiendaId, recurso: RECURSO, periodo, cantidadUsada: minutos, cantidadIncluida: incluidas },
    update: { cantidadUsada: { increment: minutos }, cantidadIncluida: incluidas, fechaActualizacion: new Date() }
  });
}

/** "4 h 48 min", "45 min", "0 min". */
export function textoMinutos(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
