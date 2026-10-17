import { prisma } from "../../../config/prisma.js";
import { ConflictError, ValidationError } from "../../../utils/errors.js";
import { aplicarAccion, detalleReservaAdmin, efectivoDe, pedidoDeReserva } from "../reservas.service.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { fechaLima, horaLima, instanteLima } from "../tiempo.js";
import { verticalHotel } from "./vertical.js";

/**
 * Ciclo de la reserva del hotel en recepción (docs/specs/ciclo-reserva-hotel):
 * check-in con registro de huéspedes, check-out con la cuenta, código del PMS
 * y notas para el siguiente turno.
 */

const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const num = (v) => Number(v ?? 0);
const redondear = (n) => Math.round(n * 100) / 100;

const conflicto = (message, motivo, extra = {}) => new ConflictError(message, { message, motivo, ...extra });
const invalido = (message, campo) => new ValidationError(message, { message, body: { [campo]: [message] } });

/** "HH:mm" de hoy (Lima) como instante; sin hora, ahora. No acepta una hora futura. */
function instanteDeHoy(hora, ahora) {
  if (!hora) return ahora;
  const instante = instanteLima(fechaLima(ahora), hora);
  if (instante.getTime() > ahora.getTime() + 5 * 60_000) throw invalido("La hora no puede ser posterior a la actual", "hora");
  return instante;
}

/**
 * Cobro en el mostrador: queda como pago del pedido (con el medio y el
 * comprobante) y baja el saldo en destino. Lo usan el check-in, el check-out y
 * los cargos que se cobran en recepción.
 */
export async function cobrarEnMostrador(tx, pedido, { monto, formaPago, comprobante = null, concepto }, usuario, ahora) {
  if (monto <= 0) return num(pedido.montoPagado);
  await tx.pagos.create({
    data: {
      tiendaId: pedido.tiendaId, pedidoId: pedido.id, proveedor: "mostrador", metodo: formaPago, monto, moneda: "PEN", estado: "pagado",
      metadata: { origen: "mostrador", concepto, comprobante }, fechaRegistro: ahora, usuarioRegistro: usuario
    }
  });
  const pagado = redondear(num(pedido.montoPagado) + monto);
  await tx.pedidos.update({
    where: { id: pedido.id },
    data: { montoPagado: pagado, estadoPago: pagado >= num(pedido.total) ? "pagado" : "parcial", fechaActualizacion: ahora }
  });
  await tx.reservas.update({
    where: { pedidoId: pedido.id },
    data: { saldoDestino: Math.max(0, redondear(num(pedido.reserva.saldoDestino) - monto)) }
  });
  return pagado;
}

/**
 * Check-in (C1): desde el día de llegada, con el documento del titular
 * confirmado y nombre y documento de cada acompañante. El saldo se puede
 * cobrar ahora o en el check-out.
 */
export async function registrarCheckin(tiendaId, pedidoId, { acompanantes = [], hora = null, cobro = null }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  if (efectivoDe(pedido, ahora) !== "confirmada") {
    throw conflicto("Solo una reserva confirmada puede hacer el check-in", "CHECKIN_NO_DISPONIBLE");
  }
  if (fechaLima(r.inicio) > fechaLima(ahora)) {
    throw conflicto(`La llegada es el ${fechaLima(r.inicio)}: el check-in se registra desde ese día`, "CHECKIN_ANTICIPADO");
  }
  const faltan = (num(r.adultos) + num(r.ninos)) - 1 - acompanantes.length;
  if (faltan > 0) {
    throw invalido(faltan === 1 ? "Falta registrar 1 acompañante" : `Faltan registrar ${faltan} acompañantes`, "acompanantes");
  }
  const entrada = instanteDeHoy(hora, ahora);
  const usuario = usuarioDe(user);
  const saldo = redondear(num(pedido.total) - num(pedido.montoPagado));

  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "check_in", {
      ahora, datosPedido: { usuarioActualizacion: usuario }, nota: `Check-in ${horaLima(entrada)}`
    });
    await tx.reservas.update({
      where: { pedidoId },
      data: { checkinEn: entrada, acompanantes: acompanantes.map(a => ({ ...a, docNumero: a.docNumero.toUpperCase() })) }
    });
    if (cobro?.formaPago && saldo > 0) {
      await cobrarEnMostrador(tx, pedido, { monto: saldo, formaPago: cobro.formaPago, comprobante: cobro.comprobante ?? null, concepto: "Saldo al llegar" }, usuario, ahora);
    }
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Check-out (C2): con saldo hay que cobrarlo (medio de pago y comprobante).
 * La reserva queda completada y sus noches dejan de ocupar cupo.
 */
export async function registrarCheckout(tiendaId, pedidoId, { formaPago = null, comprobante = null, hora = null } = {}, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (efectivoDe(pedido, ahora) !== "hospedada") {
    throw conflicto("Solo una reserva con check-in puede hacer el check-out", "CHECKOUT_NO_DISPONIBLE");
  }
  const saldo = redondear(num(pedido.total) - num(pedido.montoPagado));
  if (saldo > 0 && !formaPago) {
    throw conflicto(`Falta cobrar S/ ${saldo.toFixed(2)} antes del check-out`, "SALDO_PENDIENTE", { saldo });
  }
  const salida = instanteDeHoy(hora, ahora);
  const usuario = usuarioDe(user);

  await prisma.$transaction(async (tx) => {
    if (saldo > 0) await cobrarEnMostrador(tx, pedido, { monto: saldo, formaPago, comprobante, concepto: "Saldo al salir" }, usuario, ahora);
    await aplicarAccion(tx, pedido, "check_out", {
      ahora, datosPedido: { usuarioActualizacion: usuario },
      nota: `Check-out ${horaLima(salida)}${saldo > 0 ? ` · cobró S/ ${saldo.toFixed(2)} (${formaPago}${comprobante ? `, ${comprobante}` : ""})` : ""}`
    });
    await tx.reservas.update({ where: { pedidoId }, data: { checkoutEn: salida } });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Código de la reserva en el PMS del hotel (C8): lo escribe recepción a mano.
 * Vacío lo quita. Un código ya usado en otra reserva de la tienda es un error
 * de tipeo: se rechaza diciendo cuál.
 */
export async function guardarCodigoPms(tiendaId, pedidoId, { codigo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const valor = codigo?.trim() || null;
  if (valor) {
    const otra = await prisma.reservas.findFirst({
      where: { tiendaId, codigoPms: { equals: valor, mode: "insensitive" }, pedidoId: { not: pedidoId } },
      select: { pedido: { select: { numeroPedido: true } } }
    });
    if (otra) throw conflicto(`El código ${valor} ya está asociado a ${otra.pedido.numeroPedido}`, "CODIGO_PMS_REPETIDO");
  }
  if ((pedido.reserva.codigoPms ?? null) === valor) return detalleReservaAdmin(tiendaId, pedidoId, ahora);
  await prisma.$transaction([
    prisma.reservas.update({ where: { pedidoId }, data: { codigoPms: valor } }),
    prisma.pedido_historial_estados.create({
      data: { pedidoId, estado: pedido.estado, notas: valor ? `Código PMS ${valor}` : "Código PMS quitado" }
    })
  ]);
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Nota para el siguiente turno (C9): se agrega al final y no se edita. El
 * UPDATE concatena en la base para no perder la nota de otra persona del turno.
 */
export async function agregarNota(tiendaId, pedidoId, { texto }, user, ahora = new Date()) {
  await pedidoDeReserva(tiendaId, pedidoId);
  const nota = { texto: texto.trim(), autor: user?.user_metadata?.full_name || usuarioDe(user), en: ahora.toISOString() };
  await prisma.$executeRaw`
    UPDATE reservas SET notas = notas || ${JSON.stringify([nota])}::jsonb
    WHERE pedido_id = ${pedidoId}::uuid AND tienda_id = ${tiendaId}::uuid`;
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

// ---------- Cambios antes y durante la estadía (C3, C4) ----------

const ANTES_DE_LLEGAR = ["solicitada", "aceptada", "pago_en_revision", "confirmada"];
const noches = (n) => `${n} ${n === 1 ? "noche" : "noches"}`;
const soles = (n) => `S/ ${Number(n).toFixed(2)}`;
const dias = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Errores de la cotización como 400 con la lista (la ficha muestra el primero). */
function exigirSinErrores(c, ignorar = []) {
  const errores = c.errores.filter(e => !ignorar.includes(e.codigo));
  if (errores.length) throw new ValidationError(errores[0].mensaje, { message: errores[0].mensaje, motivo: "RESERVA_NO_VALIDA", errores });
}

/** Los datos con que se cotizó la reserva, para volver a cotizarla con cambios. */
function datosDe(tiendaId, pedidoId, r, cambios = {}) {
  return {
    tiendaId, productoId: r.productoId, modalidadId: r.modalidadId,
    fecha: fechaLima(r.inicio), noches: r.noches, adultos: r.adultos ?? 1, ninos: r.ninos ?? 0,
    edadesNinos: r.edadesNinos ?? [], habitaciones: r.habitaciones ?? 1,
    // Solo los extras del catálogo: los cargos del mostrador no se recotizan.
    extras: (Array.isArray(r.extras) ? r.extras : []).filter(x => x.id && !x.origen && x.estado !== "rechazado")
      .map(x => ({ extraId: x.id, cantidad: x.cantidad, dato: x.dato ?? null })),
    planId: r.plan?.id ?? null, nacionalidad: r.titularNacionalidad ?? null, lang: r.idiomaHuesped,
    excluirPedidoId: pedidoId,
    ...cambios
  };
}

/** Modalidad por noche del tipo elegido (al cambiar de tipo de habitación). */
async function modalidadNoche(tiendaId, productoId) {
  const m = await prisma.hotel_modalidades.findFirst({
    where: { tiendaId, productoId, tipo: "noche", activo: true }, orderBy: { orden: "asc" }, select: { id: true }
  });
  if (!m) throw invalido("Ese tipo de habitación no se vende por noche", "productoId");
  return m.id;
}

/** Pedido y reserva con el total nuevo; el saldo en el hotel es lo que falta pagar. */
async function aplicarTotal(tx, pedido, total, lineas, datosReserva, nota, usuario, ahora) {
  const pagado = num(pedido.montoPagado);
  await tx.pedidos.update({
    where: { id: pedido.id },
    data: {
      total, subtotal: total, ...(datosReserva.inicio ? { fechaServicio: datosReserva.inicio } : {}),
      estadoPago: pagado >= total && total > 0 ? "pagado" : pagado > 0 ? "parcial" : "pendiente",
      fechaActualizacion: ahora, usuarioActualizacion: usuario
    }
  });
  if (lineas) {
    await tx.pedido_detalles.deleteMany({ where: { pedidoId: pedido.id } });
    await tx.pedido_detalles.createMany({ data: lineas });
  }
  await tx.reservas.update({ where: { pedidoId: pedido.id }, data: datosReserva });
  await tx.pedido_historial_estados.create({ data: { pedidoId: pedido.id, estado: pedido.estado, notas: nota } });
}

/**
 * Modificar (C3): fecha, noches, tipo y huéspedes antes de llegar. Se recotiza
 * con las reglas de la tienda (temporadas, extras, plan) y el cupo no cuenta a
 * la propia reserva. Lo ya pagado se mantiene; el saldo absorbe la diferencia.
 */
export async function modificarReserva(tiendaId, pedidoId, cambios, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  const estado = efectivoDe(pedido, ahora);
  if (!ANTES_DE_LLEGAR.includes(estado)) throw conflicto("Solo se modifica una reserva que todavía no llega", "NO_MODIFICABLE");
  const productoId = cambios.productoId ?? r.productoId;
  const ninos = cambios.ninos ?? r.ninos ?? 0;
  const datos = datosDe(tiendaId, pedidoId, r, {
    productoId,
    modalidadId: productoId === r.productoId ? r.modalidadId : await modalidadNoche(tiendaId, productoId),
    fecha: cambios.fecha ?? fechaLima(r.inicio),
    noches: cambios.noches ?? r.noches,
    adultos: cambios.adultos ?? r.adultos,
    ninos,
    edadesNinos: (cambios.edadesNinos ?? r.edadesNinos ?? []).slice(0, ninos)
  });
  const config = await obtenerConfig(tiendaId);
  const { producto, c, detalle, inventario } = await verticalHotel.cotizar({ tiendaId, datos, config, ahora });
  exigirSinErrores(c);

  const pagado = num(pedido.montoPagado);
  const sinPagos = pagado === 0 && estado !== "pago_en_revision";
  const { apartadoHasta, idiomaHuesped, ...columnas } = detalle;
  const antes = `${fechaLima(r.inicio)} · ${noches(r.noches)} · ${r.producto?.nombre ?? ""}`;
  const diferencia = redondear(c.total - num(pedido.total));
  const usuario = usuarioDe(user);
  await prisma.$transaction(async (tx) => {
    await aplicarTotal(tx, pedido, c.total,
      c.lineas.map(l => ({ pedidoId, productoId: producto.id, productoNombre: producto.nombre, varianteNombre: l.descripcion.slice(0, 100), cantidad: l.cantidad, precioUnitario: l.precioUnitario, total: l.total })),
      {
        productoId: producto.id, ...columnas, inicio: c.inicio, fin: c.fin,
        // Sin pagos se recalcula todo; con pagos, lo pagado queda y el saldo absorbe la diferencia.
        ...(sinPagos ? { montoAPagar: c.montoAPagar, saldoDestino: c.saldoDestino } : { saldoDestino: Math.max(0, redondear(c.total - pagado)) })
      },
      `Modificada: antes ${antes}${diferencia ? ` · diferencia ${diferencia > 0 ? "+" : "−"}${soles(Math.abs(diferencia))}` : ""}`,
      usuario, ahora);
    // Con inventario se revalida el cupo con el tipo bloqueado (C1).
    await verticalHotel.enTransaccion(tx, { tiendaId, pedidoId, c, estadoInicial: estado, ahora, inventario });
  }, { maxWait: 5000, timeout: 15000 });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Cambiar la salida de un huésped hospedado (C4). Extender cotiza las noches
 * nuevas y valida el cupo; salir antes libera las noches que no usa (vuelven a
 * la venta) y las descuenta, salvo tarifa no reembolsable.
 */
export async function cambiarSalida(tiendaId, pedidoId, { fechaSalida }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  if (efectivoDe(pedido, ahora) !== "hospedada") throw conflicto("La salida se cambia con el huésped hospedado", "SALIDA_NO_DISPONIBLE");
  const llegada = fechaLima(r.inicio);
  const salidaActual = fechaLima(r.fin);
  if (fechaSalida < fechaLima(ahora)) throw invalido("La salida no puede ser antes de hoy", "fechaSalida");
  if (fechaSalida === salidaActual) throw invalido("Es la misma fecha de salida", "fechaSalida");
  const nuevas = dias(llegada, fechaSalida);
  if (nuevas < 1) throw invalido("La estadía debe tener al menos una noche", "fechaSalida");
  const d = nuevas - r.noches;
  const config = await obtenerConfig(tiendaId);

  // Se cotizan solo las noches que se agregan o se quitan, sin extras.
  const desde = d > 0 ? salidaActual : fechaSalida;
  const { c, inventario } = await verticalHotel.cotizar({ tiendaId, datos: datosDe(tiendaId, pedidoId, r, { fecha: desde, noches: Math.abs(d), extras: [] }), config, ahora });
  // Al quitar noches solo interesa el precio: que hoy ya pasó el check-in no importa.
  exigirSinErrores(c, d < 0 ? ["FECHA_PASADA", "ANTICIPACION_INSUFICIENTE", "SIN_CUPO", "MIN_NOCHES"] : []);
  const reembolsable = r.plan?.reembolsable !== false;
  const monto = d > 0 ? c.total : reembolsable ? -c.total : 0;
  const total = redondear(num(pedido.total) + monto);
  const usuario = usuarioDe(user);
  const nota = d > 0
    ? `Extendió ${noches(d)} hasta ${fechaSalida} · +${soles(c.total)}`
    : `Salida anticipada al ${fechaSalida}: libera ${noches(-d)}${reembolsable ? ` · −${soles(c.total)}` : " (tarifa no reembolsable: se cobran igual)"}`;
  await prisma.$transaction(async (tx) => {
    await aplicarTotal(tx, pedido, total, null, {
      noches: nuevas, fin: instanteLima(fechaSalida, horaLima(r.fin)), saldoDestino: Math.max(0, redondear(total - num(pedido.montoPagado)))
    }, nota, usuario, ahora);
    await tx.pedido_detalles.create({
      data: {
        pedidoId, productoId: r.productoId, productoNombre: r.producto?.nombre ?? "Habitación",
        varianteNombre: (d > 0 ? `Extensión ${noches(d)}` : `Salida anticipada: −${noches(-d)}`).slice(0, 100),
        cantidad: Math.abs(d), precioUnitario: redondear(Math.abs(monto) / Math.abs(d)), total: monto
      }
    });
    if (d > 0) await verticalHotel.enTransaccion(tx, { tiendaId, pedidoId, c, estadoInicial: "confirmada", ahora, inventario: inventario && { ...inventario, fecha: llegada, noches: nuevas } });
  }, { maxWait: 5000, timeout: 15000 });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

// ---------- Early check-in y late check-out (C7) ----------

const NOMBRE_HORARIO = { early: "Early check-in", late: "Late check-out" };

/**
 * El hotel responde un early/late que pidió el huésped. Aprobado queda como
 * está (ya suma al total); rechazado se descuenta, y si ya estaba pagado el
 * historial dice cuánto devolver.
 */
export async function responderHorario(tiendaId, pedidoId, { extraId, aprobar }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  if (!["confirmada", "hospedada", "pago_en_revision", "aceptada"].includes(efectivoDe(pedido, ahora))) {
    throw conflicto("Esta reserva ya no admite cambios", "NO_MODIFICABLE");
  }
  const extras = Array.isArray(r.extras) ? r.extras : [];
  const i = extras.findIndex(x => x.id === extraId && x.horario && x.estado === "pedido");
  if (i < 0) throw conflicto("Ese pedido ya se respondió o no existe", "HORARIO_NO_PEDIDO");
  const x = extras[i];
  const lista = extras.map((e, j) => (j === i ? { ...e, estado: aprobar ? "aprobado" : "rechazado" } : e));
  const nombre = `${NOMBRE_HORARIO[x.horario]}${x.hora ? ` ${x.hora}` : ""}`;
  const usuario = usuarioDe(user);
  if (aprobar) {
    await prisma.$transaction([
      prisma.reservas.update({ where: { pedidoId }, data: { extras: lista } }),
      prisma.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: `${nombre} aprobado` } })
    ]);
    return detalleReservaAdmin(tiendaId, pedidoId, ahora);
  }
  const total = redondear(num(pedido.total) - num(x.total));
  const devolver = Math.max(0, redondear(num(pedido.montoPagado) - total));
  await prisma.$transaction(async (tx) => {
    await aplicarTotal(tx, pedido, total, null, { extras: lista, saldoDestino: Math.max(0, redondear(total - num(pedido.montoPagado))) },
      `${nombre} rechazado · −${soles(x.total)}${devolver ? ` · devolver ${soles(devolver)}` : ""}`, usuario, ahora);
    await tx.pedido_detalles.create({
      data: { pedidoId, productoId: r.productoId, productoNombre: r.producto?.nombre ?? "Habitación", varianteNombre: `${nombre} (rechazado)`.slice(0, 100), cantidad: 1, precioUnitario: -num(x.total), total: -num(x.total) }
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/**
 * Salida tardía que da recepción a un huésped hospedado (C7.4): queda como
 * extra aprobado del mostrador, suma al saldo y mueve la hora de salida.
 */
export async function darSalidaTardia(tiendaId, pedidoId, { hora, precio }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  if (efectivoDe(pedido, ahora) !== "hospedada") throw conflicto("La salida tardía se da con el huésped hospedado", "SALIDA_NO_DISPONIBLE");
  const extras = Array.isArray(r.extras) ? r.extras : [];
  if (extras.some(x => x.horario === "late" && x.estado === "aprobado")) throw conflicto("Esta reserva ya tiene una salida tardía", "LATE_YA_DADO");
  const monto = redondear(precio);
  const nombre = `${NOMBRE_HORARIO.late} ${hora}`;
  const total = redondear(num(pedido.total) + monto);
  const extra = { nombre: NOMBRE_HORARIO.late, horario: "late", hora, cobro: "estadia", precio: monto, cantidad: 1, total: monto, estado: "aprobado", origen: "mostrador" };
  await prisma.$transaction(async (tx) => {
    await aplicarTotal(tx, pedido, total, null, {
      extras: [...extras, extra], fin: instanteLima(fechaLima(r.fin), hora), saldoDestino: Math.max(0, redondear(total - num(pedido.montoPagado)))
    }, `${nombre} desde el mostrador · +${soles(monto)}`, usuarioDe(user), ahora);
    await tx.pedido_detalles.create({
      data: { pedidoId, productoId: r.productoId, productoNombre: r.producto?.nombre ?? "Habitación", varianteNombre: nombre, cantidad: 1, precioUnitario: monto, total: monto }
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

// ---------- Cancelación y no-show con la política (C5, C6) ----------

/** Precio de una noche de la reserva: el alojamiento (sin extras) entre las noches. */
export function tarifaPorNoche(pedido) {
  const r = pedido.reserva;
  // Un early/late rechazado ya se descontó del total.
  const extras = (Array.isArray(r.extras) ? r.extras : []).filter(x => x.estado !== "rechazado").reduce((s, x) => s + num(x.total), 0);
  return r.noches ? redondear((num(pedido.total) - extras) / r.noches) : num(pedido.total);
}

/**
 * Penalidad de cancelación (C5.2). Si cancela el hotel, nada; tarifa no
 * reembolsable, todo lo pagado; con anticipación suficiente, nada; si no, las
 * noches de la política. Nunca más de lo pagado.
 */
export function penalidadCancelacion({ quien, pagado, reembolsable, horasAntes, tarifaNoche, config }) {
  if (quien === "hotel") return 0;
  if (!reembolsable) return pagado;
  if (horasAntes >= config.cancelacionGratisHoras) return 0;
  return Math.min(pagado, redondear(config.penalidadNoches * tarifaNoche));
}

export async function cancelarHotel(tiendaId, pedidoId, { quien, motivo }, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  const r = pedido.reserva;
  if (!ANTES_DE_LLEGAR.includes(efectivoDe(pedido, ahora))) throw conflicto("Solo se cancela una reserva que todavía no llega", "NO_CANCELABLE");
  const config = await obtenerConfig(tiendaId);
  const pagado = num(pedido.montoPagado);
  const penalidad = penalidadCancelacion({
    quien, pagado, reembolsable: r.plan?.reembolsable !== false,
    horasAntes: (r.inicio.getTime() - ahora.getTime()) / 3_600_000, tarifaNoche: tarifaPorNoche(pedido), config
  });
  const reembolso = redondear(pagado - penalidad);
  const usuario = usuarioDe(user);
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, quien === "hotel" ? "cancelar_negocio" : "cancelar_cliente", {
      ahora, datosPedido: { usuarioActualizacion: usuario },
      nota: `Cancelada por ${quien === "hotel" ? "el hotel" : "el huésped"}: ${motivo}${penalidad ? ` · retiene ${soles(penalidad)}` : ""}${reembolso ? ` · reembolso ${soles(reembolso)}` : ""}`
    });
    await tx.reservas.update({
      where: { pedidoId },
      data: { retenido: penalidad, cancelacion: { quien, motivo, penalidad, reembolso, en: ahora.toISOString(), usuario } }
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}

/** No llegó (C6): con garantía se retiene la primera noche (hasta lo pagado); las noches vuelven a la venta. */
export async function marcarNoLlego(tiendaId, pedidoId, user, ahora = new Date()) {
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (efectivoDe(pedido, ahora) !== "confirmada") throw conflicto("Solo una reserva confirmada se marca como no llegó", "NO_SHOW_NO_DISPONIBLE");
  if (pedido.reserva.inicio > ahora) throw conflicto("Solo se puede marcar después de la hora de llegada", "AUN_NO_INICIA");
  const pagado = num(pedido.montoPagado);
  const cargo = Math.min(pagado, tarifaPorNoche(pedido));
  const usuario = usuarioDe(user);
  await prisma.$transaction(async (tx) => {
    await aplicarAccion(tx, pedido, "no_show", {
      ahora, datosPedido: { usuarioActualizacion: usuario },
      nota: `No se presentó${cargo ? ` · retiene ${soles(cargo)}` : ""}${pagado - cargo > 0 ? ` · reembolso ${soles(pagado - cargo)}` : ""}`
    });
    await tx.reservas.update({
      where: { pedidoId },
      data: { retenido: cargo, cancelacion: { quien: "no_show", motivo: "No se presentó", penalidad: cargo, reembolso: redondear(pagado - cargo), en: ahora.toISOString(), usuario } }
    });
  });
  return detalleReservaAdmin(tiendaId, pedidoId, ahora);
}
