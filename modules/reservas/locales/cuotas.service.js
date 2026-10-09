import { prisma, Prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { transicionar } from "../estados.js";
import { subirCaptura } from "../reservas.capturas.js";
import { serializeReservaAdmin } from "../reservas.serializer.js";
import { confirmadaEmail, pagoSubidoEmail } from "../reservas.emails.js";
import {
  aplicarAccion, correoCliente, detalleReservaAdmin, efectivoDe, enviar, obtenerSeguimiento, pedidoDeReserva
} from "../reservas.service.js";
import { fechaLima, sumarHoras } from "../tiempo.js";
import { actualizarOcupacion } from "./ocupaciones.js";
import { montoPagadoDe, planBloqueado, validarPlan } from "./plan-pagos.js";
import { filasCuotas, generarContrato } from "./locales.service.js";
import { etiquetaConcepto } from "./contrato.js";

/**
 * Plan de pagos de una reserva de local (docs/specs/alquiler-locales R7, R8).
 *
 * El cliente acepta el contrato y paga cuota por cuota; el negocio verifica
 * cada captura. La PRIMERA cuota verificada confirma la reserva y la fecha
 * queda bloqueada para siempre (la ocupación pasa a `reserva`, sin
 * vencimiento). Las siguientes no cambian el estado de la reserva.
 */

const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const redondear = (n) => Math.round(n * 100) / 100;
const minDate = (a, b) => (a < b ? a : b);

const conflicto = (motivo, message, extra = {}) => new ConflictError(message, { message, motivo, ...extra });

async function pedidoLocal(tiendaId, pedidoId) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (pedido.tipo !== "local") throw new NotFoundError("Reserva", "Reserva no encontrada");
  return pedido;
}

function cuotaDe(pedido, cuotaId) {
  const cuota = pedido.cuotas.find(c => c.id === cuotaId);
  if (!cuota) throw new NotFoundError("Cuota", "Cuota no encontrada");
  return cuota;
}

const pagoPendienteDe = (pedido, cuotaId) => [...pedido.pagos].reverse()
  .find(p => p.cuotaId === cuotaId && p.proveedor === "manual" && p.estado === "pendiente");

// ============================================
// Store (con el token de seguimiento)
// ============================================

/**
 * El cliente acepta el contrato (R8.3): debe enviar la versión y el hash del
 * texto que leyó. Si el negocio lo cambió después, 409 CONTRATO_DESACTUALIZADO.
 */
export async function aceptarContrato(tiendaId, pedidoId, { version, hash }, { ip = null } = {}, ahora = new Date()) {
  const pedido = await pedidoLocal(tiendaId, pedidoId);
  const estado = efectivoDe(pedido, ahora);
  const contrato = pedido.reserva.contrato;
  if (!contrato || !["aceptada", "pago_en_revision", "confirmada"].includes(estado)) {
    throw conflicto("CONTRATO_NO_DISPONIBLE", "El contrato estará disponible cuando el local acepte tu solicitud");
  }
  if (contrato.version !== version || contrato.hash !== hash) {
    throw conflicto("CONTRATO_DESACTUALIZADO", "El contrato cambió. Actualiza la página y léelo de nuevo antes de aceptarlo.");
  }
  // Repetir la aceptación no la cambia (doble clic).
  if (contrato.aceptadoEn) return obtenerSeguimiento(tiendaId, pedidoId, ahora);

  const r = pedido.reserva;
  await prisma.$transaction(async (tx) => {
    await tx.reservas.update({
      where: { pedidoId },
      data: {
        contrato: {
          ...contrato, aceptadoEn: ahora.toISOString(), ip,
          aceptadoPor: { nombre: `${r.titularNombres} ${r.titularApellidos}`, docTipo: r.titularDocTipo, docNumero: r.titularDocNumero }
        }
      }
    });
    await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: `Contrato v${contrato.version} aceptado por el cliente` } });
  });
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

/**
 * Captura (o solo el número de operación, R14.6) de UNA cuota (R7.3). Antes
 * de confirmarse, solo se paga la primera cuota (la separación). Volver a
 * subirla mientras está en revisión reemplaza la anterior.
 */
export async function subirCapturaCuota(tiendaId, pedidoId, cuotaId, { file, metodo, numeroOperacion }, ahora = new Date()) {
  const pedido = await pedidoLocal(tiendaId, pedidoId);
  const estado = efectivoDe(pedido, ahora);
  if (estado !== "confirmada") transicionar(estado, "subir_captura", "local");
  if (!pedido.reserva.contrato?.aceptadoEn) throw conflicto("CONTRATO_NO_ACEPTADO", "Acepta el contrato antes de pagar");

  const cuota = cuotaDe(pedido, cuotaId);
  if (cuota.estado === "pagada") throw conflicto("CUOTA_YA_PAGADA", "Esta cuota ya está pagada");
  if (cuota.estado === "anulada") throw conflicto("CUOTA_ANULADA", "Esta cuota ya no forma parte del plan");
  const primera = pedido.cuotas.filter(c => c.estado !== "anulada").sort((a, b) => a.numero - b.numero)[0];
  if (estado !== "confirmada" && cuota.id !== primera.id) {
    throw conflicto("PRIMERO_SEPARACION", `Primero paga la ${etiquetaConcepto(primera.concepto).toLowerCase()} para separar la fecha`);
  }
  if (!file && !numeroOperacion) {
    const message = "Adjunta la captura o escribe el número de operación";
    throw new ValidationError(message, { message, body: { captura: [message] } });
  }

  const capturaPath = file ? await subirCaptura({ tiendaId, pedidoId, file }) : null;
  await prisma.$transaction(async (tx) => {
    // Una captura nueva de la misma cuota reemplaza la que estaba en revisión.
    await tx.pagos.updateMany({
      where: { pedidoId, cuotaId, proveedor: "manual", estado: "pendiente" },
      data: { estado: "fallido", outcomeMensaje: "Reemplazada por otra captura", fechaActualizacion: ahora }
    });
    await tx.pagos.create({
      data: {
        tiendaId, pedidoId, cuotaId, proveedor: "manual", metodo, monto: cuota.monto, moneda: "PEN", estado: "pendiente",
        metadata: { capturaPath, numeroOperacion, cuota: cuota.numero }, fechaRegistro: ahora, usuarioRegistro: "storefront"
      }
    });
    await tx.reserva_cuotas.update({ where: { id: cuota.id }, data: { estado: "en_revision", fechaActualizacion: ahora } });
    const nota = `Captura de la cuota ${cuota.numero} (${etiquetaConcepto(cuota.concepto)}, ${metodo}${numeroOperacion ? ` · Op. ${numeroOperacion}` : ""})`;
    if (estado === "confirmada") {
      await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: nota } });
    } else {
      await aplicarAccion(tx, pedido, "subir_captura", { ahora, datosPedido: { metodoPago: metodo, referenciaPago: numeroOperacion }, nota });
      // El cliente ya pagó: la fecha deja de vencer mientras el negocio revisa.
      await actualizarOcupacion(tx, pedidoId, { expiraEn: null });
    }
  });

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { email: true } });
  enviar(tienda?.email, pagoSubidoEmail(serializeReservaAdmin(await pedidoDeReserva(tiendaId, pedidoId))), pedido.clienteEmail);
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

// ============================================
// Admin
// ============================================

/**
 * Verifica la captura de una cuota (R7.4). La primera confirma la reserva y
 * bloquea la fecha. `monto_pagado` es la suma de cuotas pagadas SIN la
 * garantía (R7.8). Repetirlo no duplica nada (CE-17).
 */
export async function verificarCuota(tiendaId, pedidoId, cuotaId, user, ahora = new Date()) {
  const pedido = await pedidoLocal(tiendaId, pedidoId);
  const cuota = cuotaDe(pedido, cuotaId);
  if (cuota.estado === "pagada") return detalleReservaAdmin(tiendaId, pedidoId, ahora);
  const pago = pagoPendienteDe(pedido, cuotaId);
  if (!pago || cuota.estado !== "en_revision") throw conflicto("SIN_PAGO_PENDIENTE", "No hay un pago por verificar en esta cuota");

  const estado = efectivoDe(pedido, ahora);
  const confirma = estado === "pago_en_revision";
  const montoPagado = montoPagadoDe(pedido.cuotas.map(c => (c.id === cuotaId ? { ...c, estado: "pagada" } : c)));
  const datosPedido = {
    montoPagado,
    estadoPago: montoPagado >= Number(pedido.total) ? "pagado" : "parcial",
    usuarioActualizacion: usuarioDe(user)
  };
  const nota = `Cuota ${cuota.numero} verificada · ${etiquetaConcepto(cuota.concepto)} · S/ ${Number(cuota.monto).toFixed(2)} · ${pago.metodo}`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pagos.update({
        where: { id: pago.id },
        data: { estado: "pagado", metadata: { ...pago.metadata, verificadoPor: usuarioDe(user) }, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
      });
      // Condicionada al estado leído: dos personas del equipo a la vez → la segunda recibe 409.
      const { count } = await tx.reserva_cuotas.updateMany({
        where: { id: cuotaId, pedidoId, estado: "en_revision" },
        data: { estado: "pagada", pagadaEn: ahora, fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
      });
      if (count === 0) throw conflicto("RESERVA_MODIFICADA", "La reserva cambió mientras la revisabas. Actualiza la página.");
      if (confirma) {
        await aplicarAccion(tx, pedido, "verificar", { ahora, datosPedido: { ...datosPedido, fechaConfirmado: ahora }, nota });
        await actualizarOcupacion(tx, pedidoId, { tipo: "reserva", expiraEn: null });
      } else {
        await tx.pedidos.update({ where: { id: pedidoId }, data: { ...datosPedido, fechaActualizacion: ahora } });
        await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: nota } });
      }
    });
  } catch (error) {
    // Un segundo pago "pagado" para la misma cuota (CE-11): el índice único lo impide.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflicto("CUOTA_YA_PAGADA", "Esta cuota ya tiene un pago verificado");
    }
    throw error;
  }

  if (confirma) await correoCliente(tiendaId, pedidoId, confirmadaEmail);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * "No corresponde" (R7.4, CT-04): la cuota vuelve a pendiente. Si era la
 * primera, la reserva vuelve a `aceptada` con un apartado nuevo.
 */
export async function rechazarCuota(tiendaId, pedidoId, cuotaId, { motivo }, user, ahora = new Date()) {
  const pedido = await pedidoLocal(tiendaId, pedidoId);
  const cuota = cuotaDe(pedido, cuotaId);
  const pago = pagoPendienteDe(pedido, cuotaId);
  if (!pago || cuota.estado !== "en_revision") throw conflicto("SIN_PAGO_PENDIENTE", "No hay un pago por verificar en esta cuota");
  const vuelveAAceptada = efectivoDe(pedido, ahora) === "pago_en_revision";
  const config = vuelveAAceptada ? await obtenerConfig(tiendaId) : null;

  await prisma.$transaction(async (tx) => {
    await tx.pagos.update({
      where: { id: pago.id },
      data: {
        estado: "fallido", outcomeMensaje: motivo, metadata: { ...pago.metadata, motivo, revisadoPor: usuarioDe(user) },
        fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user)
      }
    });
    await tx.reserva_cuotas.update({ where: { id: cuotaId }, data: { estado: "pendiente", fechaActualizacion: ahora } });
    const nota = `Pago de la cuota ${cuota.numero} no corresponde: ${motivo}`;
    if (vuelveAAceptada) {
      const apartadoHasta = minDate(sumarHoras(ahora, config.apartadoHoras), pedido.reserva.inicio);
      await aplicarAccion(tx, pedido, "rechazar_pago", { ahora, datosPedido: { usuarioActualizacion: usuarioDe(user) }, nota });
      await tx.reservas.update({ where: { pedidoId }, data: { apartadoHasta } });
      await actualizarOcupacion(tx, pedidoId, { expiraEn: apartadoHasta });
    } else {
      await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: nota } });
    }
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * El negocio edita montos y fechas del plan antes del primer pago (R7.2).
 * Después: 409 PLAN_BLOQUEADO (los cambios son cargos o reprogramaciones).
 * El contrato se regenera con el plan nuevo y el cliente lo vuelve a aceptar.
 */
export async function editarPlan(tiendaId, pedidoId, { cuotas }, user, ahora = new Date()) {
  const pedido = await pedidoLocal(tiendaId, pedidoId);
  if (efectivoDe(pedido, ahora) !== "aceptada") throw conflicto("PLAN_BLOQUEADO", "El plan solo se edita con la reserva aceptada y sin pagos");
  if (planBloqueado(pedido.cuotas)) throw conflicto("PLAN_BLOQUEADO", "El cliente ya pagó una cuota: el plan ya no se puede editar");

  const r = pedido.reserva;
  const total = Number(pedido.total);
  const errores = validarPlan(cuotas, { total, garantia: Number(r.local?.garantia ?? 0), fechaEvento: fechaLima(r.inicio), hoy: fechaLima(ahora) });
  if (errores.length) throw new ValidationError(errores[0], { message: errores[0], motivo: "PLAN_INVALIDO", errores });

  const nuevas = cuotas.map((c, i) => ({ numero: i + 1, concepto: c.concepto, monto: redondear(c.monto), venceEn: c.venceEn }));
  const [config, tienda] = await Promise.all([
    obtenerConfig(tiendaId),
    prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true, razonSocial: true, ruc: true, direccion: true } })
  ]);
  const contrato = generarContrato({ tienda, config, pedido, total, cuotas: nuevas, ahora });
  const antes = pedido.cuotas.map(c => ({ numero: c.numero, concepto: c.concepto, monto: Number(c.monto), venceEn: c.venceEn.toISOString().slice(0, 10) }));

  await prisma.$transaction(async (tx) => {
    await tx.reserva_cuotas.deleteMany({ where: { pedidoId, tiendaId } });
    await tx.reserva_cuotas.createMany({ data: filasCuotas(nuevas, { tiendaId, pedidoId, usuario: usuarioDe(user) }) });
    await tx.reservas.update({ where: { pedidoId }, data: { contrato, montoAPagar: nuevas[0].monto } });
    await tx.reserva_cambios.create({
      data: { tiendaId, pedidoId, tipo: "ajuste_plan", actor: "negocio", antes: { cuotas: antes }, despues: { cuotas: nuevas }, usuarioRegistro: usuarioDe(user) }
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}
