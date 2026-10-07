import { prisma } from "../../config/prisma.js";
import {
  BLOQUE_EXCEDENTE_MIN, PRECIO_BLOQUE_EXCEDENTE, TOPE_EXCEDENTE_MES_MIN, asignarConsumo, duracionEfectiva, minutosADescontar,
  montoExcedente, periodoTransmision, saldoConReservas
} from "./transmisiones.reglas.js";

/**
 * Horas de transmisión del plan Privado (R7). Todo en minutos "de paquete"
 * (minutos transmitidos × factor del tope de invitados).
 *
 * Fuentes, en orden de consumo (R7.3):
 *   1. plan del mes: planes.horas_transmision_mes × 60, no se acumula (R7.4);
 *   2. paquetes prepagados activos y vigentes, el que vence primero;
 *   3. excedente confirmado, con tope de 2 h por mes, cobrado a mano.
 *
 * Lo ya consumido está en transmision_movimientos. Lo "reservado" son las
 * transmisiones programadas que todavía no terminan: al activar o extender se
 * exige que alcance contando esas reservas. El mes es el del inicio de la
 * función (hora de Lima).
 */

export const RECURSO = "transmision_minutos";
const ESTADOS_EXCEDENTE_VIGENTE = ["autorizado", "por_cobrar", "cobrado"];

async function incluidasMin(client, tiendaId) {
  const tienda = await client.tiendas.findUnique({ where: { id: tiendaId }, select: { plan: { select: { horasTransmisionMes: true } } } });
  return (tienda?.plan?.horasTransmisionMes ?? 0) * 60;
}

/** Minutos que una transmisión pendiente aparta de las horas: contratados (con extensiones) × factor, menos lo cubierto con excedente. */
function reservaDe(t) {
  const total = minutosADescontar(duracionEfectiva(t, t.funcion), t.factor ?? 1);
  const conExcedente = t.excedente?.estado === "autorizado" ? t.excedente.minutosAutorizados : 0;
  return Math.max(0, total - conExcedente);
}

/** Excedente ya comprometido en el mes (autorizado o cobrado). */
async function excedenteDelMes(client, tiendaId, periodo) {
  const filas = await client.transmision_excedentes.findMany({
    where: { tiendaId, periodo, estado: { in: ESTADOS_EXCEDENTE_VIGENTE } },
    select: { estado: true, minutos: true, minutosAutorizados: true }
  });
  return filas.reduce((s, e) => s + (e.estado === "autorizado" ? e.minutosAutorizados : e.minutos), 0);
}

/**
 * @param {{ excluirId?: string, ahora?: Date }} [opts] - excluirId: transmisión que no cuenta como reservada.
 */
export async function saldoHoras(tiendaId, periodo, { excluirId, ahora = new Date() } = {}) {
  const [incluidas, usosPlan, paquetes, pendientes, excedenteUsado] = await Promise.all([
    incluidasMin(prisma, tiendaId),
    prisma.transmision_movimientos.groupBy({ by: ["periodo"], where: { tiendaId, fuente: "plan" }, _sum: { minutos: true } }),
    prisma.transmision_paquetes.findMany({
      where: { tiendaId, estado: "activo", venceEn: { gt: ahora } },
      orderBy: { venceEn: "asc" },
      select: { id: true, minutos: true, minutosUsados: true, venceEn: true, compradoEn: true }
    }),
    prisma.evento_transmisiones.findMany({
      where: { tiendaId, plan: { not: "basico" }, estado: "programada", terminadaEn: null, ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: {
        duracionMin: true, factor: true, extensionMin: true,
        funcion: { select: { inicio: true, fin: true } },
        excedente: { select: { estado: true, minutosAutorizados: true } }
      }
    }),
    excedenteDelMes(prisma, tiendaId, periodo)
  ]);

  const planRestantePorMes = Object.fromEntries(usosPlan.map(u => [u.periodo, incluidas - (u._sum.minutos ?? 0)]));
  const paquetesRestante = paquetes.reduce((s, p) => s + (p.minutos - p.minutosUsados), 0);
  const reservas = pendientes
    .sort((a, b) => a.funcion.inicio - b.funcion.inicio)
    .map(t => ({ periodo: periodoTransmision(t.funcion), minutos: reservaDe(t) }));
  const s = saldoConReservas({ periodo, planRestantePorMes, planIncluido: incluidas, paquetesRestante, reservas });

  return {
    periodo,
    incluidasMin: incluidas,
    planUsadoMin: incluidas - (periodo in planRestantePorMes ? planRestantePorMes[periodo] : incluidas),
    planDisponibleMin: s.planDisponible,
    paquetes: paquetes.map(p => ({ id: p.id, minutos: p.minutos, usadosMin: p.minutosUsados, venceEn: p.venceEn, compradoEn: p.compradoEn })),
    paquetesDisponiblesMin: s.paquetesDisponible,
    reservadasMin: s.reservadas,
    disponiblesMin: s.disponibles,
    excedente: {
      topeMin: TOPE_EXCEDENTE_MES_MIN,
      usadoMin: excedenteUsado,
      disponibleMin: Math.max(0, TOPE_EXCEDENTE_MES_MIN - excedenteUsado),
      precioBloque: PRECIO_BLOQUE_EXCEDENTE,
      bloqueMin: BLOQUE_EXCEDENTE_MIN
    }
  };
}

/**
 * Reparte y registra lo descontado al terminar (dentro de la transacción del
 * corte): plan del mes → paquetes (bloqueados con FOR UPDATE, el que vence
 * primero) → excedente confirmado → absorbido. Cierra el excedente con lo
 * realmente usado: por_cobrar, o anulado si no se usó (R6.3).
 */
export async function registrarConsumo(tx, t, minutos, ahora = new Date()) {
  const periodo = periodoTransmision(t.funcion);
  const incluidas = await incluidasMin(tx, t.tiendaId);
  const usoPlan = await tx.transmision_movimientos.aggregate({ where: { tiendaId: t.tiendaId, periodo, fuente: "plan" }, _sum: { minutos: true } });
  const paquetes = await tx.$queryRaw`
    SELECT id, minutos - minutos_usados AS restante
    FROM transmision_paquetes
    WHERE tienda_id = ${t.tiendaId}::uuid AND estado = 'activo' AND vence_en > ${ahora} AND minutos_usados < minutos
    ORDER BY vence_en ASC
    FOR UPDATE`;
  const excedente = await tx.transmision_excedentes.findUnique({ where: { transmisionId: t.id } });

  const reparto = asignarConsumo({
    minutos,
    planRestante: incluidas - (usoPlan._sum.minutos ?? 0),
    paquetes: paquetes.map(p => ({ id: p.id, restante: Number(p.restante) })),
    excedenteAutorizado: excedente?.estado === "autorizado" ? excedente.minutosAutorizados : 0
  });

  const base = { tiendaId: t.tiendaId, transmisionId: t.id, periodo };
  const movimientos = [];
  if (reparto.plan) movimientos.push({ ...base, fuente: "plan", minutos: reparto.plan });
  for (const p of reparto.paquetes) {
    movimientos.push({ ...base, fuente: "paquete", paqueteId: p.id, minutos: p.minutos });
    await tx.transmision_paquetes.update({ where: { id: p.id }, data: { minutosUsados: { increment: p.minutos }, fechaActualizacion: ahora } });
  }
  if (reparto.excedente) movimientos.push({ ...base, fuente: "excedente", minutos: reparto.excedente });
  if (reparto.absorbido) movimientos.push({ ...base, fuente: "absorbido", minutos: reparto.absorbido });
  if (movimientos.length) await tx.transmision_movimientos.createMany({ data: movimientos });

  if (excedente?.estado === "autorizado") {
    await tx.transmision_excedentes.update({
      where: { id: excedente.id },
      data: reparto.excedente
        ? { minutos: reparto.excedente, monto: montoExcedente(reparto.excedente), estado: "por_cobrar", fechaActualizacion: ahora }
        : { estado: "anulado", fechaActualizacion: ahora, usuarioActualizacion: "sin uso" }
    });
  }

  // Resumen mensual (reportes y consistencia con los demás recursos de la tienda).
  if (minutos > 0) {
    await tx.tienda_uso_recursos.upsert({
      where: { uq_tienda_recurso_periodo: { tiendaId: t.tiendaId, recurso: RECURSO, periodo } },
      create: { tiendaId: t.tiendaId, recurso: RECURSO, periodo, cantidadUsada: minutos, cantidadIncluida: incluidas },
      update: { cantidadUsada: { increment: minutos }, cantidadIncluida: incluidas, fechaActualizacion: ahora }
    });
  }
  return reparto;
}

/** "4 h 48 min", "45 min", "0 min". */
export function textoMinutos(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export { excedenteDelMes };
