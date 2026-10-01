/**
 * Consumo mensual de IA por tienda: asesor de ventas (storefront) y asistente
 * "Guía" (panel admin).
 *
 * Unidad de cara al emprendedor: CONSULTAS (1 mensaje = 1 consulta). Los tokens
 * se acumulan solo para que la plataforma conozca su costo real.
 *
 * Límite efectivo = el menor entre el tope del plan y el que fije el dueño
 * (tienda_configuraciones, clave "consumo_ia"). El dueño solo puede bajarlo.
 *
 * Flujo por mensaje (ver `conConsulta`):
 *   1. reservar la consulta ANTES de llamar al LLM (atómico, no se pasa del tope
 *      aunque lleguen mensajes concurrentes)
 *   2. si el LLM falla → se devuelve la consulta (no cobrar respuestas fallidas)
 *   3. si sale bien → se suman los tokens y, si se cruzó el % de aviso, se manda
 *      UN correo al dueño por mes.
 *
 * @see docs/sql/consumo_ia.sql
 */

import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import config from "../../config/index.js";
import logger from "../../config/logger.js";
import { QuotaExceededError, ValidationError } from "../../utils/errors.js";
import { sendConsumoIaAvisoEmail } from "../../services/email.service.js";

export const TIPOS = {
  asesor: {
    recurso: "consultas_asesor_ia",
    nombre: "Asesor de ventas",
    campoPlan: "limiteConsultasAsesorMes",
    sinPlan: () => config.consumoIa.limiteAsesorSinPlan
  },
  asistente: {
    recurso: "consultas_asistente_ia",
    nombre: "Guía del panel",
    campoPlan: "limiteConsultasAsistenteMes",
    sinPlan: () => config.consumoIa.limiteAsistenteSinPlan,
    // Tope diario además del mensual: que nadie gaste el mes en un día. Solo lo
    // fija el plan (el dueño ajusta el mensual).
    diario: {
      recurso: "consultas_asistente_ia_dia",
      campoPlan: "limiteConsultasAsistenteDia",
      sinPlan: () => config.consumoIa.limiteAsistenteDiaSinPlan
    }
  }
};

const CLAVE_CONFIG = "consumo_ia";
const CATEGORIA_CONFIG = "ia";

// El negocio opera en Perú: el mes se corta a medianoche de Lima, no de UTC.
const ZONA = "America/Lima";

/** "YYYY-MM" del mes actual en hora de Lima. */
export function periodoActual(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" })
    .formatToParts(fecha);
  const y = partes.find(p => p.type === "year").value;
  const m = partes.find(p => p.type === "month").value;
  return `${y}-${m}`;
}

/** "YYYY-MM-DD" del día en que se reinicia el contador (1ro del mes siguiente). */
export function fechaReinicio(periodo) {
  const [y, m] = periodo.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** "YYYY-MM-DD" de hoy en hora de Lima. */
export function diaActual(fecha = new Date()) {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(fecha);
}

/** "YYYY-MM-DD" del día siguiente (cuando se reinicia el tope diario). */
export function diaSiguiente(dia) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Tope diario del plan. null = sin tope diario (o el tipo no tiene). Puro. */
export function calcularLimiteDiario(def, plan) {
  if (!def.diario) return null;
  return plan ? (plan[def.diario.campoPlan] ?? null) : def.diario.sinPlan();
}

/**
 * Suma 1 al contador (tienda, recurso, periodo) solo si no pasa del límite.
 * Un solo INSERT ... ON CONFLICT con WHERE: si dos mensajes llegan a la vez con
 * 1 consulta libre, solo uno la obtiene. Devuelve [] si ya no quedan.
 */
function incrementarUso(tiendaId, recurso, periodo, limite) {
  return prisma.$queryRaw`
    INSERT INTO tienda_uso_recursos (id, tienda_id, recurso, periodo, cantidad_usada, cantidad_incluida, fecha_registro)
    VALUES (${randomUUID()}::uuid, ${tiendaId}::uuid, ${recurso}, ${periodo}, 1, ${limite}, now())
    ON CONFLICT (tienda_id, recurso, periodo) DO UPDATE
      SET cantidad_usada = tienda_uso_recursos.cantidad_usada + 1,
          cantidad_incluida = EXCLUDED.cantidad_incluida,
          fecha_actualizacion = now()
      WHERE ${limite}::int IS NULL OR tienda_uso_recursos.cantidad_usada < ${limite}::int
    RETURNING cantidad_usada, aviso_enviado_en
  `;
}

function decrementarUso(tiendaId, recurso, periodo) {
  return prisma.$executeRaw`
    UPDATE tienda_uso_recursos
    SET cantidad_usada = GREATEST(cantidad_usada - 1, 0), fecha_actualizacion = now()
    WHERE tienda_id = ${tiendaId}::uuid AND recurso = ${recurso} AND periodo = ${periodo}
  `;
}

/**
 * Reserva la consulta del día. Sin tope diario no toca la BD.
 * @returns {Promise<string|null>} el día reservado (para revertir) o null.
 */
async function reservarDia(tiendaId, tipo, def, plan) {
  const limite = calcularLimiteDiario(def, plan);
  if (limite === null) return null;

  const dia = diaActual();
  const agotado = () => {
    const message = `Llegaste al límite de ${limite} consultas de ${def.nombre} por hoy`;
    return new QuotaExceededError(message, {
      message, tipo, alcance: "dia", usadas: limite, limite, reiniciaEl: diaSiguiente(dia)
    });
  };

  if (limite <= 0) throw agotado();
  const filas = await incrementarUso(tiendaId, def.diario.recurso, dia, limite);
  if (filas.length === 0) throw agotado();
  return dia;
}

function tipoValido(tipo) {
  const def = TIPOS[tipo];
  if (!def) throw new ValidationError(`Tipo de consumo IA inválido: ${tipo}`);
  return def;
}

async function leerAjustesDueno(tiendaId) {
  const row = await prisma.tienda_configuraciones.findUnique({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE_CONFIG } },
    select: { valor: true }
  });
  return row?.valor ?? {};
}

/**
 * Límite efectivo de un tipo. Puro: recibe lo ya leído de la BD.
 * @returns {{ limitePlan: number|null, limiteDueno: number|null, limite: number|null, avisoPct: number|null }}
 *   null = ilimitado (limite) / sin ajuste (limiteDueno) / sin aviso (avisoPct)
 */
export function calcularLimite(def, plan, ajustes = {}) {
  const limitePlan = plan ? (plan[def.campoPlan] ?? null) : def.sinPlan();
  const limiteDueno = Number.isInteger(ajustes.limite) ? ajustes.limite : null;
  const limite = limiteDueno == null ? limitePlan
    : limitePlan == null ? limiteDueno
    : Math.min(limitePlan, limiteDueno);
  const avisoPct = Number.isInteger(ajustes.avisoPct) ? ajustes.avisoPct : null;
  return { limitePlan, limiteDueno, limite, avisoPct };
}

async function leerContexto(tiendaId) {
  const [tienda, ajustes] = await Promise.all([
    prisma.tiendas.findUnique({
      where: { id: tiendaId },
      select: { nombre: true, email: true, logoUrl: true, plan: true }
    }),
    leerAjustesDueno(tiendaId)
  ]);
  return { tienda, ajustes };
}

/**
 * Reserva una consulta: primero la del día (si el tipo tiene tope diario) y luego
 * la del mes. Lanza QuotaExceededError (`alcance: "dia" | "mes"`) si ya no quedan.
 * @returns {Promise<{ usadas: number, limite: number|null, avisoPct: number|null, avisoEnviado: boolean, tienda: object, periodo: string, dia: string|null }>}
 */
export async function reservarConsulta(tiendaId, tipo) {
  const def = tipoValido(tipo);
  const { tienda, ajustes } = await leerContexto(tiendaId);
  const { limite, avisoPct } = calcularLimite(def, tienda?.plan, ajustes[tipo]);
  const periodo = periodoActual();

  const agotado = () => {
    const message = `Se alcanzó el límite de ${limite} consultas de ${def.nombre} este mes`;
    // details viaja como `data` en la respuesta de error (error.middleware).
    return new QuotaExceededError(message, {
      message, tipo, alcance: "mes", usadas: limite, limite, reiniciaEl: fechaReinicio(periodo)
    });
  };

  if (limite !== null && limite <= 0) throw agotado();

  // El día va primero: si hoy ya se agotó, el contador del mes no se toca.
  const dia = await reservarDia(tiendaId, tipo, def, tienda?.plan);

  const filas = await incrementarUso(tiendaId, def.recurso, periodo, limite);
  if (filas.length === 0) {
    if (dia) {
      await decrementarUso(tiendaId, def.diario.recurso, dia).catch(e =>
        logger.error(`[consumo-ia] no se pudo revertir la consulta del día (${tipo}): ${e.message}`)
      );
    }
    throw agotado();
  }

  return {
    usadas: Number(filas[0].cantidad_usada),
    limite,
    avisoPct,
    avisoEnviado: filas[0].aviso_enviado_en != null,
    tienda,
    periodo,
    dia
  };
}

/**
 * Devuelve una consulta reservada cuyo turno falló (mes y, si hubo, día).
 * Usa los periodos de la reserva: un turno que cruza la medianoche revierte lo
 * que realmente reservó.
 */
export async function revertirConsulta(tiendaId, tipo, { periodo = periodoActual(), dia = null } = {}) {
  const def = tipoValido(tipo);
  await decrementarUso(tiendaId, def.recurso, periodo);
  if (dia && def.diario) await decrementarUso(tiendaId, def.diario.recurso, dia);
}

/**
 * Acumula el `usage` de una respuesta del Messages API en `uso` (mutándolo).
 * La entrada incluye lo escrito y leído de cache: también se factura.
 */
export function sumarUso(uso, usage) {
  if (!usage) return uso;
  uso.entrada += (usage.input_tokens ?? 0)
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0);
  uso.salida += usage.output_tokens ?? 0;
  return uso;
}

/**
 * Suma los tokens de un turno. `uso` es el acumulado de los `response.usage`
 * del loop de tool-use (input incluye lo leído/escrito en cache).
 */
export async function registrarTokens(tiendaId, tipo, uso) {
  const def = tipoValido(tipo);
  const entrada = BigInt(uso?.entrada ?? 0);
  const salida = BigInt(uso?.salida ?? 0);
  if (entrada === 0n && salida === 0n) return;
  await prisma.$executeRaw`
    UPDATE tienda_uso_recursos
    SET tokens_entrada = tokens_entrada + ${entrada}, tokens_salida = tokens_salida + ${salida}
    WHERE tienda_id = ${tiendaId}::uuid AND recurso = ${def.recurso} AND periodo = ${periodoActual()}
  `;
}

/** true si con `usadas` se alcanzó el % de aviso (y hay algo que avisar). */
export function cruzoAviso({ usadas, limite, avisoPct }) {
  if (limite == null || avisoPct == null || limite <= 0) return false;
  return usadas >= Math.ceil((limite * avisoPct) / 100);
}

/**
 * Manda el correo de aviso si corresponde. Marca aviso_enviado_en con un UPDATE
 * condicional para que dos requests concurrentes no manden dos correos.
 * Nunca lanza: un correo fallido no debe tumbar la respuesta del chat.
 */
async function avisarSiCorresponde(tiendaId, tipo, reserva) {
  if (reserva.avisoEnviado || !cruzoAviso(reserva)) return;
  if (!reserva.tienda?.email) return;

  try {
    const marcadas = await prisma.$executeRaw`
      UPDATE tienda_uso_recursos SET aviso_enviado_en = now()
      WHERE tienda_id = ${tiendaId}::uuid AND recurso = ${TIPOS[tipo].recurso}
        AND periodo = ${periodoActual()} AND aviso_enviado_en IS NULL
    `;
    if (marcadas === 0) return;

    await sendConsumoIaAvisoEmail(reserva.tienda, {
      nombre: TIPOS[tipo].nombre,
      usadas: reserva.usadas,
      limite: reserva.limite,
      avisoPct: reserva.avisoPct,
      reiniciaEl: fechaReinicio(periodoActual())
    });
  } catch (err) {
    logger.error(`[consumo-ia] no se pudo enviar el aviso (${tipo}, tienda ${tiendaId}): ${err.message}`);
  }
}

/**
 * Envuelve un turno de chat con el control de consumo.
 * `fn` debe devolver `{ ..., uso: { entrada, salida } }`.
 * @returns {Promise<{ resultado: object, consumo: { usadas: number, limite: number|null } }>}
 */
export async function conConsulta(tiendaId, tipo, fn) {
  const reserva = await reservarConsulta(tiendaId, tipo);

  let resultado;
  try {
    resultado = await fn();
  } catch (err) {
    await revertirConsulta(tiendaId, tipo, reserva).catch(e =>
      logger.error(`[consumo-ia] no se pudo revertir la consulta (${tipo}): ${e.message}`)
    );
    throw err;
  }

  await registrarTokens(tiendaId, tipo, resultado?.uso).catch(e =>
    logger.error(`[consumo-ia] no se pudieron registrar tokens (${tipo}): ${e.message}`)
  );
  // Sin await: el correo no debe demorar la respuesta del chat.
  avisarSiCorresponde(tiendaId, tipo, reserva);

  return { resultado, consumo: { usadas: reserva.usadas, limite: reserva.limite } };
}

/** Resumen para la página "Consumo IA" del panel. */
export async function obtenerConsumo(tiendaId) {
  const periodo = periodoActual();
  const dia = diaActual();
  const recursosDia = Object.values(TIPOS).filter(t => t.diario).map(t => t.diario.recurso);
  const [{ tienda, ajustes }, filas] = await Promise.all([
    leerContexto(tiendaId),
    prisma.tienda_uso_recursos.findMany({
      where: {
        tiendaId,
        OR: [
          { periodo, recurso: { in: Object.values(TIPOS).map(t => t.recurso) } },
          { periodo: dia, recurso: { in: recursosDia } }
        ]
      },
      select: { recurso: true, cantidadUsada: true }
    })
  ]);

  const usadasPor = Object.fromEntries(filas.map(f => [f.recurso, f.cantidadUsada]));

  return {
    periodo,
    reiniciaEl: fechaReinicio(periodo),
    plan: tienda?.plan ? { codigo: tienda.plan.codigo, nombre: tienda.plan.nombre } : null,
    emailAvisos: tienda?.email ?? null,
    tipos: Object.entries(TIPOS).map(([tipo, def]) => ({
      tipo,
      nombre: def.nombre,
      usadas: usadasPor[def.recurso] ?? 0,
      ...calcularLimite(def, tienda?.plan, ajustes[tipo]),
      // Solo tipos con tope diario. limite null = sin tope diario en el plan.
      diario: def.diario
        ? {
            usadas: usadasPor[def.diario.recurso] ?? 0,
            limite: calcularLimiteDiario(def, tienda?.plan),
            reiniciaEl: diaSiguiente(dia)
          }
        : null
    }))
  };
}

/**
 * Guarda el ajuste del dueño para un tipo. `limite: null` = usar el del plan;
 * `avisoPct: null` = sin aviso. Si cambia algo, se rearma el aviso del mes.
 */
export async function guardarAjustes(tiendaId, tipo, { limite, avisoPct }, user) {
  const def = tipoValido(tipo);
  const { tienda, ajustes } = await leerContexto(tiendaId);
  const { limitePlan } = calcularLimite(def, tienda?.plan, {});

  if (limite != null && limitePlan != null && limite > limitePlan) {
    const message = `El límite no puede superar el de tu plan (${limitePlan} consultas al mes)`;
    throw new ValidationError(message, { message });
  }

  const usuario = user?.email || user?.id || "system";
  const valor = { ...ajustes, [tipo]: { limite: limite ?? null, avisoPct: avisoPct ?? null } };

  await prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE_CONFIG } },
    create: { tiendaId, clave: CLAVE_CONFIG, valor, categoria: CATEGORIA_CONFIG, usuarioRegistro: usuario },
    update: { valor, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });

  // Con un tope o % nuevo, el aviso de este mes vuelve a evaluarse.
  await prisma.tienda_uso_recursos.updateMany({
    where: { tiendaId, recurso: def.recurso, periodo: periodoActual() },
    data: { avisoEnviadoEn: null }
  });

  return obtenerConsumo(tiendaId);
}
