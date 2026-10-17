import { prisma } from "../../../config/prisma.js";
import { ConflictError, ValidationError } from "../../../utils/errors.js";
import { cierresDeProducto } from "../cierres.service.js";
import { sumarDias } from "../tiempo.js";
import { cotizarHotel, plazoLlegadaTardia } from "./cotizar.js";
import { cargarHabitacionParaReserva } from "./habitaciones.service.js";
import { extrasDeTienda, planDeTienda, temporadasParaEstadia } from "./tarifas.service.js";
import { bloquearTipo, cupoEstadia } from "./disponibilidad.service.js";
import { traductorPara } from "../../idiomas/textos.service.js";

/**
 * Reservas de hotel / hostal (Strategy de reservas, modules/negocio/registro.js):
 * carga la habitación, cotiza la estadía y, con inventario, aparta el cupo.
 *   → { producto, c (cotización), detalle (columnas propias de `reservas`), log }
 */
export const verticalHotel = {
  tipoPedido: "hotel",
  este: "este hotel",
  async cotizar({ tiendaId, datos, config, ahora }) {
    if (!datos.modalidadId) {
      throw new ValidationError("Elige una modalidad de estadía", { message: "Elige una modalidad de estadía", motivo: "MODALIDAD_INVALIDA" });
    }
    const { producto, tipo, modalidad } = await cargarHabitacionParaReserva(tiendaId, datos.productoId, datos.modalidadId);
    const c = await cotizarHotelConCierres({ datos, tipo, modalidad, config, ahora });
    // Al crear (trae titular): lo que solo se pide en la solicitud (hospedaje-completo B3, B6).
    if (datos.titular) {
      for (const x of c.extras) {
        if (x.datoPedido && !x.dato) c.errores.push({ codigo: "DATO_EXTRA", mensaje: `${x.nombre}: ${x.datoPedido}`, campo: "extras" });
      }
    }
    return {
      producto, c,
      detalle: {
        modalidadId: modalidad.id, noches: c.noches, horas: c.horas, adultos: datos.adultos, ninos: datos.ninos,
        edadesNinos: c.edadesNinos, exoneradoIgv: c.exoneradoIgv, habitaciones: c.habitaciones,
        ...(c.extras.length ? { extras: c.extras } : {}), ...(c.plan ? { plan: c.plan } : {}),
        // Llegada tardía (ya pasó el check-in de hoy): no vence a la hora de ingreso
        // sino al terminar el día, para que el hotel alcance a atenderla.
        ...(c.inicio <= ahora ? { apartadoHasta: plazoLlegadaTardia(datos.fecha) } : {})
      },
      // Para revalidar el cupo dentro de la transacción (C1).
      inventario: tipo.unidades != null && c.noches ? { productoId: producto.id, unidades: tipo.unidades, fecha: datos.fecha, noches: c.noches } : null,
      log: `${modalidad.tipo}, ingreso ${c.inicio.toISOString()}`
    };
  },
  /**
   * Con inventario el sistema conoce el cupo: la reserva es directa (se aparta,
   * se paga y se confirma sola) aunque la tienda esté en modo solicitud. Sin
   * inventario rige su configuración (docs/specs/reserva-directa-hotel RD1).
   */
  modoConfirmacion(config, { inventario }) {
    return inventario ? "pago_directo" : config.modoConfirmacion;
  },
  /**
   * Con inventario, una reserva que nace aceptada (pago directo) o
   * confirmada aparta el cupo: se revalida con el tipo bloqueado para que
   * dos huéspedes no se lleven la última habitación (C1).
   */
  async enTransaccion(tx, { tiendaId, pedidoId, c, estadoInicial, ahora, inventario }) {
    if (!inventario || !["aceptada", "confirmada"].includes(estadoInicial)) return;
    await bloquearTipo(tx, inventario.productoId);
    // La reserva ya está insertada en esta transacción: no se cuenta a sí misma
    // (si no, la última habitación libre siempre saldría ocupada).
    const cupo = await cupoEstadia(tx, tiendaId, inventario, inventario.fecha, inventario.noches, { ahora, excluirPedidoId: pedidoId });
    if (cupo && c.habitaciones > cupo.libres) {
      const message = "Se acaba de ocupar el último cupo para esas fechas. Elige otras fechas.";
      throw new ConflictError(message, { message, motivo: "SIN_CUPO" });
    }
  }
};

async function cotizarHotelConCierres({ datos, tipo, modalidad, config, ahora }) {
  const desde = datos.fecha;
  const hasta = sumarDias(datos.fecha, Math.max(datos.noches ?? 1, 1));
  const [cierres, temporadas, extrasCatalogo, cupo, plan] = await Promise.all([
    cierresDeProducto(datos.tiendaId, datos.productoId, desde, hasta),
    modalidad.tipo === "noche" ? temporadasParaEstadia(datos.tiendaId, datos.productoId, desde, hasta, datos.lang) : [],
    datos.extras?.length ? extrasDeTienda(datos.tiendaId, datos.lang) : [],
    modalidad.tipo === "noche" && datos.noches
      // Al modificar una reserva (ciclo-reserva-hotel C3, C4) no se cuenta a sí misma.
      ? cupoEstadia(prisma, datos.tiendaId, { productoId: datos.productoId, unidades: tipo.unidades }, datos.fecha, datos.noches, { ahora, excluirPedidoId: datos.excluirPedidoId ?? null })
      : null,
    datos.planId ? planDeTienda(datos.tiendaId, datos.planId, datos.lang) : null
  ]);
  const cotizacion = cotizarHotel({
    tipo, modalidad, fecha: datos.fecha, hora: datos.hora, noches: datos.noches,
    adultos: datos.adultos, ninos: datos.ninos, cierres, config, ahora,
    temporadas, extrasCatalogo, extrasElegidos: datos.extras ?? [], edadesNinos: datos.edadesNinos ?? [],
    nacionalidad: datos.titular?.nacionalidad ?? datos.nacionalidad ?? null,
    habitaciones: datos.habitaciones ?? 1, cupo, plan,
    // Líneas y errores en el idioma de quien reserva (docs/specs/idiomas B7).
    traductor: await traductorPara(datos.tiendaId, datos.lang),
    // Adelanto o total, si la tienda deja elegir (C8).
    pago: datos.pago
  });
  if (datos.planId && !plan) cotizacion.errores.push({ codigo: "PLAN_INVALIDO", mensaje: "Esa tarifa ya no está disponible", campo: "planId" });
  if (modalidad.tipo === "horas" && !datos.hora) {
    cotizacion.errores.unshift({ codigo: "HORA_REQUERIDA", mensaje: "Indica la hora de ingreso", campo: "hora" });
  }
  if (modalidad.tipo === "noche" && !datos.noches) {
    cotizacion.errores.unshift({ codigo: "NOCHES_REQUERIDAS", mensaje: "Indica cuántas noches", campo: "noches" });
  }
  return cotizacion;
}
