import { prisma } from "../../../config/prisma.js";
import { ConflictError } from "../../../utils/errors.js";

/**
 * Ocupaciones de un salón (docs/specs/alquiler-locales R3, plan "Disponibilidad").
 *
 * La regla "una fecha nunca se vende dos veces" vive en la BD: la restricción
 * de exclusión `ex_local_ocupacion` (docs/sql/locales_fase_1.sql) rechaza con
 * 23P01 una franja activa que se cruce con otra del mismo salón. Este módulo
 * solo traduce ese error y mantiene las filas en sincronía con el estado de
 * la reserva. Todo se llama DENTRO de la transacción que cambia la reserva.
 *
 * Una fila con `expira_en` vencido no ocupa: las lecturas la ignoran y
 * `ocupar` la desactiva antes de insertar (Railway puede dormir: no hay job).
 */

export const MENSAJE_NO_DISPONIBLE = "Esa fecha y turno se acaban de ocupar. Elige otra fecha.";

/** Error interno: el servicio lo convierte en 409 con alternativas fuera de la transacción. */
export class FechaNoDisponibleError extends ConflictError {
  constructor() {
    super(MENSAJE_NO_DISPONIBLE, { message: MENSAJE_NO_DISPONIBLE, motivo: "FECHA_NO_DISPONIBLE" });
    this.name = "FechaNoDisponibleError";
  }
}

/**
 * ¿Es una violación de la restricción de exclusión? El adapter de pg la
 * entrega con distintas formas según la versión de Prisma.
 */
export function esExclusion(error) {
  if (!error) return false;
  const codigos = [error.code, error.meta?.code, error.meta?.driverAdapterError?.cause?.originalCode, error.cause?.code, error.cause?.originalCode];
  return codigos.includes("23P01") || /23P01|ex_local_ocupacion|exclusion constraint/i.test(String(error.message));
}

/** Filtro de Prisma: ocupaciones vigentes de un salón que tocan [desde, hasta). */
export const whereVigentes = (productoIds, desde, hasta, ahora = new Date()) => ({
  productoId: { in: productoIds },
  activo: true,
  OR: [{ expiraEn: null }, { expiraEn: { gt: ahora } }],
  inicio: { lt: hasta },
  fin: { gt: desde }
});

/** Lecturas (calendario, cotización, alternativas): fuera de la transacción. */
export async function ocupacionesVigentes(tiendaId, productoIds, desde, hasta, { ahora = new Date(), client = prisma, excluirPedidoId = null } = {}) {
  return client.local_ocupaciones.findMany({
    where: { tiendaId, ...whereVigentes(productoIds, desde, hasta, ahora), ...(excluirPedidoId ? { NOT: { pedidoId: excluirPedidoId } } : {}) },
    orderBy: { inicio: "asc" },
    select: { id: true, productoId: true, pedidoId: true, tipo: true, inicio: true, fin: true, expiraEn: true, motivo: true }
  });
}

/**
 * Ocupa una franja. Desactiva antes los apartados vencidos que estorban y la
 * fila anterior de la misma reserva (reprogramación).
 * @throws {FechaNoDisponibleError}
 */
export async function ocupar(tx, { tiendaId, productoId, pedidoId = null, tipo, inicio, fin, expiraEn = null, motivo = null, usuario = null }) {
  await tx.$executeRaw`
    UPDATE local_ocupaciones SET activo = false
    WHERE producto_id = ${productoId}::uuid AND activo AND expira_en IS NOT NULL AND expira_en <= now()
      AND franja && tstzrange(${inicio}::timestamptz, ${fin}::timestamptz, '[)')`;
  if (pedidoId) {
    await tx.$executeRaw`UPDATE local_ocupaciones SET activo = false WHERE pedido_id = ${pedidoId}::uuid AND activo`;
  }
  try {
    const [fila] = await tx.$queryRaw`
      INSERT INTO local_ocupaciones (id, tienda_id, producto_id, pedido_id, tipo, inicio, fin, expira_en, motivo, usuario_registro)
      VALUES (gen_random_uuid(), ${tiendaId}::uuid, ${productoId}::uuid, ${pedidoId}::uuid, ${tipo}, ${inicio}::timestamptz,
              ${fin}::timestamptz, ${expiraEn}::timestamptz, ${motivo}, ${usuario})
      RETURNING id`;
    return fila.id;
  } catch (error) {
    if (esExclusion(error)) throw new FechaNoDisponibleError();
    throw error;
  }
}

/** Cambia el tipo o el vencimiento de la fila activa de una reserva (aceptar, pagar, verificar). */
export async function actualizarOcupacion(tx, pedidoId, { tipo, expiraEn }) {
  return tx.local_ocupaciones.updateMany({
    where: { pedidoId, activo: true },
    data: { ...(tipo ? { tipo } : {}), ...(expiraEn !== undefined ? { expiraEn } : {}) }
  });
}

/** Libera la franja de una reserva (rechazo, cancelación, vencimiento, suspensión). */
export async function liberar(tx, pedidoId) {
  return tx.local_ocupaciones.updateMany({ where: { pedidoId, activo: true }, data: { activo: false } });
}

/**
 * Higiene al leer la bandeja: libera las franjas de las reservas que ya no
 * ocupan (vencidas, rechazadas, canceladas). Las lecturas ya las ignoran por
 * `expira_en`; esto evita filas activas huérfanas.
 */
export async function liberarHuerfanas(tiendaId) {
  await prisma.$executeRaw`
    UPDATE local_ocupaciones o SET activo = false
    FROM pedidos p
    WHERE o.pedido_id = p.id AND o.tienda_id = ${tiendaId}::uuid AND o.activo
      AND p.estado IN ('vencida', 'rechazada', 'cancelada', 'suspendida')`;
}
