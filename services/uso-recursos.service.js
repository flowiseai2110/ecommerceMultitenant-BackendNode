import { prisma } from "../config/prisma.js";
import config from "../config/index.js";
import { QuotaExceededError, TooManyRequestsError } from "../utils/errors.js";

const RECURSO_IMAGENES_IA = "imagenes_ia";

function periodoActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Registra un uso del recurso "imagenes_ia" para la tienda en el periodo actual
 * y devuelve el consumo acumulado del mes (incluido + excedente). No bloquea
 * nunca: el modelo de negocio es pay-per-use, el excedente se factura aparte.
 * @param {string} tiendaId
 * @returns {Promise<{ cantidadUsada: number, cantidadIncluida: number|null, excedente: number }>}
 */
export async function registrarUsoImagenIA(tiendaId) {
  const periodo = periodoActual();

  const existente = await prisma.tienda_uso_recursos.findUnique({
    where: { uq_tienda_recurso_periodo: { tiendaId, recurso: RECURSO_IMAGENES_IA, periodo } }
  });

  let uso;
  if (existente) {
    uso = await prisma.tienda_uso_recursos.update({
      where: { id: existente.id },
      data: { cantidadUsada: { increment: 1 } }
    });
  } else {
    const tienda = await prisma.tiendas.findUnique({
      where: { id: tiendaId },
      include: { plan: true }
    });

    uso = await prisma.tienda_uso_recursos.create({
      data: {
        tiendaId,
        recurso: RECURSO_IMAGENES_IA,
        periodo,
        cantidadUsada: 1,
        cantidadIncluida: tienda?.plan?.limiteImagenesIaMes ?? null
      }
    });
  }

  const excedente = uso.cantidadIncluida == null ? 0 : Math.max(0, uso.cantidadUsada - uso.cantidadIncluida);

  return { cantidadUsada: uso.cantidadUsada, cantidadIncluida: uso.cantidadIncluida, excedente };
}

/**
 * Verifica (sin incrementar) si la tienda ya alcanzó el límite de imágenes IA de su
 * plan en el periodo actual. Lanza QuotaExceededError si corresponde bloquear.
 * @param {string} tiendaId
 */
export async function verificarCuotaTienda(tiendaId) {
  const periodo = periodoActual();

  const existente = await prisma.tienda_uso_recursos.findUnique({
    where: { uq_tienda_recurso_periodo: { tiendaId, recurso: RECURSO_IMAGENES_IA, periodo } }
  });
  if (!existente) return;

  if (existente.cantidadIncluida != null && existente.cantidadUsada >= existente.cantidadIncluida) {
    const message = `Alcanzaste el límite de ${existente.cantidadIncluida} imágenes IA de tu plan este mes`;
    throw new QuotaExceededError(message, {
      message,
      cantidadUsada: existente.cantidadUsada,
      cantidadIncluida: existente.cantidadIncluida
    });
  }
}

async function contarUsoGlobal(periodo, tipo) {
  const row = await prisma.ia_uso_global.findUnique({ where: { uq_periodo_tipo: { periodo, tipo } } });
  return row?.cantidadUsada ?? 0;
}

async function incrementarUsoGlobal(periodo, tipo) {
  await prisma.ia_uso_global.upsert({
    where: { uq_periodo_tipo: { periodo, tipo } },
    update: { cantidadUsada: { increment: 1 } },
    create: { periodo, tipo, cantidadUsada: 1 }
  });
}

/**
 * Circuit breaker de plataforma: corta la generación de imágenes IA (todas las
 * tiendas) si se supera GEMINI_MAX_CALLS_DIA / GEMINI_MAX_CALLS_MES. Si no se
 * bloquea, registra el intento. Límites no configurados (null) no aplican.
 */
export async function verificarYRegistrarLimiteGlobalIA() {
  const hoy = new Date();
  const periodoDia = hoy.toISOString().slice(0, 10);
  const periodoMes = periodoActual();

  if (config.gemini.maxCallsDia != null && (await contarUsoGlobal(periodoDia, "dia")) >= config.gemini.maxCallsDia) {
    const message = "Se alcanzó el límite diario de generación de imágenes IA de la plataforma";
    throw new TooManyRequestsError(message, { message, scope: "dia" });
  }
  if (config.gemini.maxCallsMes != null && (await contarUsoGlobal(periodoMes, "mes")) >= config.gemini.maxCallsMes) {
    const message = "Se alcanzó el límite mensual de generación de imágenes IA de la plataforma";
    throw new TooManyRequestsError(message, { message, scope: "mes" });
  }

  await incrementarUsoGlobal(periodoDia, "dia");
  await incrementarUsoGlobal(periodoMes, "mes");
}

export default { registrarUsoImagenIA, verificarCuotaTienda, verificarYRegistrarLimiteGlobalIA };
