import { prisma, Prisma } from "../../../config/prisma.js";

/**
 * Lo cobrado por día (docs/specs/dashboard-por-rubro DR6): pagos verificados
 * (pasarela y capturas manuales) por fecha de verificación y, en el hotel, los
 * cobros del mostrador. Las reservas sin pagar no suman: esa era la cifra
 * inflada del dashboard anterior.
 *
 * El auto-scope de Prisma no cubre $queryRaw: el filtro de tienda va a mano.
 *
 * @returns {Promise<Map<string, number>>} "YYYY-MM-DD" (Lima) → S/
 */
export async function cobradoPorDia(tiendaId, desde, hasta, { mostrador = false } = {}) {
  const delMostrador = mostrador
    ? Prisma.sql`
      UNION ALL
      SELECT fecha AS cuando, monto FROM hotel_cobros
      WHERE tienda_id = ${tiendaId}::uuid AND fecha >= ${desde} AND fecha < ${hasta}`
    : Prisma.empty;
  const filas = await prisma.$queryRaw`
    SELECT to_char(cuando AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS dia, SUM(monto) AS monto
    FROM (
      SELECT COALESCE(fecha_actualizacion, fecha_registro) AS cuando, monto FROM pagos
      WHERE tienda_id = ${tiendaId}::uuid AND estado = 'pagado'
        AND COALESCE(fecha_actualizacion, fecha_registro) >= ${desde}
        AND COALESCE(fecha_actualizacion, fecha_registro) < ${hasta}
      ${delMostrador}
    ) c
    GROUP BY 1`;
  return new Map(filas.map((f) => [f.dia, Number(f.monto)]));
}

/** Cobros de los 60 días (periodo y anterior), una vez por request. */
export const cobrosDe = (ctx, opciones = {}) =>
  ctx.memo(`cobros:${!!opciones.mostrador}`, () =>
    cobradoPorDia(ctx.tiendaId, ctx.periodo.anteriorDesde, ctx.periodo.hasta, opciones));
