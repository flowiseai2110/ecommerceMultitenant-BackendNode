import { prisma } from "../../../config/prisma.js";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { INCLUDE_RESERVA } from "../reservas.service.js";
import { serializeReservaLista } from "../reservas.serializer.js";
import { diaSemana, fechaLima, instanteLima, rangoFechas, sumarDias } from "../tiempo.js";
import { ocupaNoche } from "./recepcion.js";
import { bloquearTipo, externasPorTipo, nochesDe, ocupaCupo, ocupacion } from "./disponibilidad.service.js";

/**
 * Cupo a la venta (docs/specs/motor-reservas-hotel M2). El hotel vende también
 * por Booking, WhatsApp y en la puerta, y lo anota en su PMS o Excel. Aquí el
 * dueño escribe cuántas habitaciones le quedan para la web y el sistema guarda
 * la diferencia como ocupadas fuera de la web (`hotel_cupo_externo`, origen
 * manual), que `ocupacion()` suma a las reservas.
 */

const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);

/**
 * Ocupadas a mano para que queden `libres`. Pura, para testearla.
 * No se puede ofrecer más de lo que dejan la web, el mostrador y el iCal:
 * en ese caso se ofrece el máximo y la noche se marca `ajustada`.
 * @returns {{ manual: number, libres: number, maximo: number, ajustada: boolean }}
 */
export function calcularManual({ unidades, enSistema, ical, libres }) {
  const maximo = Math.max(unidades - enSistema - ical, 0);
  const efectivos = Math.min(libres, maximo);
  return { manual: maximo - efectivos, libres: efectivos, maximo, ajustada: libres > maximo };
}

async function tipoConInventario(db, tiendaId, productoId) {
  const tipo = await db.hotel_tipos_habitacion.findFirst({
    where: { tiendaId, productoId },
    select: { productoId: true, unidades: true, producto: { select: { nombre: true } } }
  });
  if (!tipo) throw new NotFoundError("Tipo de habitación");
  if (tipo.unidades == null) throw new ValidationError("Primero indica cuántas habitaciones tienes de este tipo");
  return tipo;
}

/**
 * Fija los libres de un tipo en las noches de un rango (M2.2, M2.3). `dias`
 * (0 = domingo … 6 = sábado) limita el rango a esos días de la semana.
 * Dentro de una transacción con el tipo bloqueado: una reserva web que entra
 * a la vez no se cuenta dos veces.
 * @returns {Promise<{ noches: number, ajustadas: Array<{ fecha: string, libres: number }> }>}
 */
export async function fijarLibres(tiendaId, { productoId, desde, hasta, dias = null, libres }, user, ahora = new Date()) {
  const fechas = rangoFechas(desde, hasta).filter(f => !dias?.length || dias.includes(diaSemana(f)));
  if (!fechas.length) throw new ValidationError("Ninguna noche del rango cae en los días elegidos");
  const usuario = user?.email ?? user?.id ?? null;
  return prisma.$transaction(async (tx) => {
    const tipo = await tipoConInventario(tx, tiendaId, productoId);
    await bloquearTipo(tx, productoId);
    const [propias, externas] = await Promise.all([
      ocupacion(tx, tiendaId, [tipo], fechas[0], fechas.at(-1), { ahora, externas: false }),
      externasPorTipo(tx, tiendaId, [productoId], fechas[0], fechas.at(-1))
    ]);
    const ajustadas = [];
    for (const fecha of fechas) {
      const r = calcularManual({
        unidades: tipo.unidades,
        enSistema: propias.get(productoId)?.get(fecha) ?? 0,
        ical: externas.get(productoId)?.get(fecha)?.ical ?? 0,
        libres
      });
      if (r.ajustada) ajustadas.push({ fecha, libres: r.libres });
      const clave = { productoId_fecha_origen: { productoId, fecha: aFecha(fecha), origen: "manual" } };
      if (r.manual === 0) {
        await tx.hotel_cupo_externo.deleteMany({ where: { productoId, fecha: aFecha(fecha), origen: "manual" } });
      } else {
        await tx.hotel_cupo_externo.upsert({
          where: clave,
          create: { tiendaId, productoId, fecha: aFecha(fecha), origen: "manual", ocupadas: r.manual, usuarioActualizacion: usuario },
          update: { ocupadas: r.manual, fechaActualizacion: ahora, usuarioActualizacion: usuario }
        });
      }
    }
    return { noches: fechas.length, ajustadas };
  });
}

/**
 * Qué ocupa un tipo una noche (M2.5): reservas web (y solicitudes por
 * responder), estadías del mostrador y lo vendido fuera de la web.
 */
export async function detalleNoche(tiendaId, productoId, fecha, ahora = new Date()) {
  const tipo = await tipoConInventario(prisma, tiendaId, productoId);
  const [pedidos, estadias, externas] = await Promise.all([
    prisma.pedidos.findMany({
      where: {
        tiendaId, tipo: "hotel",
        estado: { in: ["solicitada", "aceptada", "pago_en_revision", "confirmada", "hospedada"] },
        reserva: {
          productoId, noches: { not: null },
          inicio: { lt: instanteLima(sumarDias(fecha, 1)) },
          fin: { gt: instanteLima(fecha) }
        }
      },
      orderBy: { fechaServicio: "asc" },
      include: { reserva: { include: INCLUDE_RESERVA.reserva.include }, pagos: true, detalles: true, cuotas: INCLUDE_RESERVA.cuotas }
    }),
    prisma.hotel_estadias.findMany({
      where: {
        tiendaId, productoId, estado: "en_curso", modalidad: "noche", pedidoId: null,
        inicio: { lt: instanteLima(sumarDias(fecha, 1)) },
        fin: { gt: instanteLima(sumarDias(fecha, 1)) }
      },
      select: { modalidad: true, inicio: true, fin: true }
    }),
    externasPorTipo(prisma, tiendaId, [productoId], fecha, fecha)
  ]);
  const deLaNoche = pedidos.filter(p => nochesDe(fechaLima(p.reserva.inicio), p.reserva.noches).includes(fecha));
  const ocupan = deLaNoche.filter(p => ocupaCupo({ estado: p.estado, apartadoHasta: p.reserva.apartadoHasta }, ahora));
  const porResponder = deLaNoche.filter(p => p.estado === "solicitada");
  const enWeb = ocupan.reduce((s, p) => s + (p.reserva.habitaciones ?? 1), 0);
  const mostrador = estadias.filter(e => ocupaNoche(e, fecha)).length;
  const { manual, ical } = externas.get(productoId)?.get(fecha) ?? { manual: 0, ical: 0 };
  const ocupadas = enWeb + mostrador + manual + ical;
  return {
    productoId, nombre: tipo.producto.nombre, fecha, unidades: tipo.unidades,
    libres: Math.max(tipo.unidades - ocupadas, 0),
    saldo: tipo.unidades - ocupadas,
    // Tope del campo "libres": lo que no ocupan la web, el mostrador ni el iCal.
    maximo: Math.max(tipo.unidades - enWeb - mostrador - ical, 0),
    mostrador, fueraDeLaWeb: { manual, ical },
    reservas: ocupan.map(p => serializeReservaLista(p, ahora)),
    porResponder: porResponder.map(p => serializeReservaLista(p, ahora))
  };
}
