import { prisma } from "../../../config/prisma.js";
import { ConflictError } from "../../../utils/errors.js";
import { esExclusion } from "../locales/ocupaciones.js";

/**
 * Ocupaciones de una cancha (docs/specs/alquiler-canchas R4). Misma técnica que
 * las de los salones (locales/ocupaciones.js): la regla "un horario nunca se
 * vende dos veces" vive en la BD, en la restricción de exclusión
 * `ex_cancha_ocupacion` (docs/sql/canchas_fase_1.sql). Aquí solo se traduce su
 * error y se mantienen las filas en sincronía con el estado de la reserva,
 * siempre DENTRO de la transacción que la cambia.
 *
 * Una fila con `expira_en` vencido no ocupa: las lecturas la ignoran y
 * `ocupar` la desactiva antes de insertar (Railway puede dormir: no hay job).
 */

export const MENSAJE_HORARIO_OCUPADO = "Ese horario se acaba de ocupar. Elige otro.";

export class HorarioOcupadoError extends ConflictError {
  constructor() {
    super(MENSAJE_HORARIO_OCUPADO, { message: MENSAJE_HORARIO_OCUPADO, motivo: "HORARIO_OCUPADO" });
    this.name = "HorarioOcupadoError";
  }
}

/** Ocupaciones vigentes de las canchas que tocan [desde, hasta). */
export async function ocupacionesVigentes(tiendaId, productoIds, desde, hasta, { ahora = new Date(), client = prisma } = {}) {
  return client.cancha_ocupaciones.findMany({
    where: {
      tiendaId,
      productoId: { in: productoIds },
      activo: true,
      OR: [{ expiraEn: null }, { expiraEn: { gt: ahora } }],
      inicio: { lt: hasta },
      fin: { gt: desde }
    },
    orderBy: { inicio: "asc" },
    select: { id: true, productoId: true, pedidoId: true, tipo: true, inicio: true, fin: true, expiraEn: true, motivo: true }
  });
}

/**
 * Ocupa una franja. Desactiva antes los apartados vencidos que estorban y la
 * fila anterior de la misma reserva.
 * @throws {HorarioOcupadoError}
 */
export async function ocupar(tx, { tiendaId, productoId, pedidoId = null, tipo, inicio, fin, expiraEn = null, motivo = null, usuario = null }) {
  await tx.$executeRaw`
    UPDATE cancha_ocupaciones SET activo = false
    WHERE producto_id = ${productoId}::uuid AND activo AND expira_en IS NOT NULL AND expira_en <= now()
      AND franja && tstzrange(${inicio}::timestamptz, ${fin}::timestamptz, '[)')`;
  if (pedidoId) {
    await tx.$executeRaw`UPDATE cancha_ocupaciones SET activo = false WHERE pedido_id = ${pedidoId}::uuid AND activo`;
  }
  try {
    const [fila] = await tx.$queryRaw`
      INSERT INTO cancha_ocupaciones (id, tienda_id, producto_id, pedido_id, tipo, inicio, fin, expira_en, motivo, usuario_registro)
      VALUES (gen_random_uuid(), ${tiendaId}::uuid, ${productoId}::uuid, ${pedidoId}::uuid, ${tipo}, ${inicio}::timestamptz,
              ${fin}::timestamptz, ${expiraEn}::timestamptz, ${motivo}, ${usuario})
      RETURNING id`;
    return fila.id;
  } catch (error) {
    if (esExclusion(error)) throw new HorarioOcupadoError();
    throw error;
  }
}

/** Cambia el tipo o el vencimiento de la fila activa de una reserva. */
export async function actualizarOcupacion(tx, pedidoId, { tipo, expiraEn }) {
  return tx.cancha_ocupaciones.updateMany({
    where: { pedidoId, activo: true },
    data: { ...(tipo ? { tipo } : {}), ...(expiraEn !== undefined ? { expiraEn } : {}) }
  });
}

/** Libera el horario de una reserva (rechazo, cancelación). */
export async function liberar(tx, pedidoId) {
  return tx.cancha_ocupaciones.updateMany({ where: { pedidoId, activo: true }, data: { activo: false } });
}
