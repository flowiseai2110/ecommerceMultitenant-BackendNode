import { prisma, Prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { fechaLima, instanteLima, sumarDias } from "../tiempo.js";
import { bloquearTipo, cupoEstadia, ocupacion } from "./disponibilidad.service.js";
import { calcularEntrada, calcularExtension, estadoHabitacion, numerosNuevos, primeraNoche } from "./recepcion.js";
import { exigirTurno, turnoAbierto } from "./caja.service.js";
import { listarHabitacionesStore } from "./habitaciones.service.js";
import { IDIOMA_BASE } from "../../idiomas/idioma.js";

/**
 * Recepción (docs/specs/recepcion, fases 1 a 3): habitaciones físicas, tablero,
 * entrada, extender, cambio de habitación, salida y limpieza. Desde la fase 2,
 * entrar, extender y cobrar exigen la caja abierta y cada cobro queda en su turno.
 *
 * Una tienda usa Recepción cuando tiene habitaciones (R1). Con ellas, el total
 * de cada tipo (`unidades`) es la cantidad de habitaciones activas, así el
 * cupo de la web y el del mostrador son el mismo.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));
const redondear = (n) => Math.round(n * 100) / 100;
const usuarioDe = (user) => user?.email ?? user?.id ?? null;
/** Estados de reserva web que cuentan como "llega hoy" en el tablero. */
const ESTADOS_LLEGADA = ["aceptada", "pago_en_revision", "confirmada"];

const conflicto = (message, motivo, extra = {}) => new ConflictError(message, { message, motivo, ...extra });
const invalido = (message, campo) => new ValidationError(message, { message, ...(campo ? { campo } : {}) });

// ---------- Habitaciones físicas (R1) ----------

const serializarHabitacion = (h) => ({
  id: h.id,
  numero: h.numero,
  piso: h.piso,
  orden: h.orden,
  estado: h.estado,
  limpieza: h.limpieza,
  productoId: h.productoId,
  tipo: h.tipo?.producto?.nombre ?? null
});

const incluirTipo = { tipo: { select: { producto: { select: { nombre: true } } } } };

export async function listarHabitaciones(tiendaId) {
  const habitaciones = await prisma.hotel_habitaciones.findMany({
    where: { tiendaId }, include: incluirTipo, orderBy: [{ orden: "asc" }, { numero: "asc" }]
  });
  return habitaciones.map(serializarHabitacion);
}

/** Con habitaciones físicas, el total del tipo son sus activas (R1.2). Sin ninguna, queda el que tenía. */
async function sincronizarUnidades(tx, productoId) {
  const activas = await tx.hotel_habitaciones.count({ where: { productoId, estado: "activa" } });
  const total = await tx.hotel_habitaciones.count({ where: { productoId } });
  if (total > 0) await tx.hotel_tipos_habitacion.update({ where: { productoId }, data: { unidades: activas } });
}

/** ¿El tipo tiene habitaciones físicas? Entonces `unidades` no se edita en la ficha. */
export async function tieneHabitacionesFisicas(productoId) {
  return (await prisma.hotel_habitaciones.count({ where: { productoId } })) > 0;
}

/**
 * Primera vez (R1.2): crea N habitaciones por tipo a partir de sus `unidades`,
 * numeradas 1, 2, 3… en el orden de los tipos. El dueño las renombra después.
 */
export async function generarHabitaciones(tiendaId, user) {
  const tipos = await prisma.hotel_tipos_habitacion.findMany({
    where: { tiendaId, producto: { activo: true } },
    select: { productoId: true, unidades: true, producto: { select: { nombre: true } }, habitacionesFisicas: { select: { id: true } } },
    orderBy: { producto: { nombre: "asc" } }
  });
  const sinHabitaciones = tipos.filter(t => !t.habitacionesFisicas.length && t.unidades > 0);
  if (!sinHabitaciones.length) {
    throw invalido("No hay tipos de habitación con total para crear. Revisa el total de cada tipo en Tipos de habitación.");
  }
  const existentes = (await prisma.hotel_habitaciones.findMany({ where: { tiendaId }, select: { numero: true } })).map(h => h.numero);
  const numeros = numerosNuevos(existentes, sinHabitaciones.reduce((s, t) => s + t.unidades, 0));
  const usuario = usuarioDe(user);
  let i = 0;
  const filas = sinHabitaciones.flatMap(t => Array.from({ length: t.unidades }, () => {
    const numero = numeros[i];
    return { tiendaId, productoId: t.productoId, numero, orden: i++, usuarioRegistro: usuario };
  }));
  await prisma.hotel_habitaciones.createMany({ data: filas });
  return listarHabitaciones(tiendaId);
}

async function tipoDeTienda(tiendaId, productoId) {
  const tipo = await prisma.hotel_tipos_habitacion.findFirst({ where: { productoId, tiendaId }, select: { productoId: true } });
  if (!tipo) throw invalido("Ese tipo de habitación no existe en esta tienda", "productoId");
  return tipo;
}

async function habitacionDeTienda(db, tiendaId, id) {
  const h = await db.hotel_habitaciones.findFirst({ where: { id, tiendaId } });
  if (!h) throw new NotFoundError("Habitación");
  return h;
}

function numeroRepetido(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return conflicto("Ya hay una habitación con ese número", "NUMERO_REPETIDO");
  }
  return error;
}

export async function crearHabitacion(tiendaId, data, user) {
  await tipoDeTienda(tiendaId, data.productoId);
  try {
    const h = await prisma.$transaction(async (tx) => {
      const creada = await tx.hotel_habitaciones.create({
        data: { tiendaId, productoId: data.productoId, numero: data.numero, piso: data.piso ?? null, orden: data.orden ?? 0, estado: data.estado ?? "activa", usuarioRegistro: usuarioDe(user) },
        include: incluirTipo
      });
      await sincronizarUnidades(tx, data.productoId);
      return creada;
    });
    return serializarHabitacion(h);
  } catch (error) { throw numeroRepetido(error); }
}

export async function actualizarHabitacion(tiendaId, id, data, user) {
  const actual = await habitacionDeTienda(prisma, tiendaId, id);
  if (data.productoId && data.productoId !== actual.productoId) {
    await tipoDeTienda(tiendaId, data.productoId);
    const enCurso = await prisma.hotel_estadias.count({ where: { habitacionId: id, estado: "en_curso" } });
    if (enCurso) throw conflicto("La habitación está ocupada: cambia su tipo cuando quede libre", "OCUPADA");
  }
  try {
    const h = await prisma.$transaction(async (tx) => {
      const editada = await tx.hotel_habitaciones.update({
        where: { id },
        data: {
          ...(data.numero !== undefined ? { numero: data.numero } : {}),
          ...(data.piso !== undefined ? { piso: data.piso } : {}),
          ...(data.orden !== undefined ? { orden: data.orden } : {}),
          ...(data.estado !== undefined ? { estado: data.estado } : {}),
          ...(data.productoId !== undefined ? { productoId: data.productoId } : {}),
          fechaActualizacion: new Date(), usuarioActualizacion: usuarioDe(user)
        },
        include: incluirTipo
      });
      await sincronizarUnidades(tx, actual.productoId);
      if (editada.productoId !== actual.productoId) await sincronizarUnidades(tx, editada.productoId);
      return editada;
    });
    return serializarHabitacion(h);
  } catch (error) { throw numeroRepetido(error); }
}

/** Solo una habitación sin historial: con estadías se pasa a mantenimiento. */
export async function eliminarHabitacion(tiendaId, id) {
  const actual = await habitacionDeTienda(prisma, tiendaId, id);
  const usadas = await prisma.hotel_estadias.count({ where: { habitacionId: id } });
  if (usadas) throw conflicto("Esta habitación ya tiene estadías registradas: ponla en mantenimiento en lugar de borrarla", "CON_HISTORIAL");
  await prisma.$transaction(async (tx) => {
    await tx.hotel_habitaciones.delete({ where: { id } });
    await sincronizarUnidades(tx, actual.productoId);
  });
  return { id };
}

// ---------- Tablero (R2) ----------

const serializarEstadia = (e) => ({
  id: e.id,
  habitacionId: e.habitacionId,
  productoId: e.productoId,
  modalidad: e.modalidad,
  inicio: e.inicio,
  fin: e.fin,
  salida: e.salida,
  estado: e.estado,
  cargos: e.cargos,
  total: num(e.total),
  pagado: num(e.pagado),
  saldo: redondear(num(e.total) - num(e.pagado)),
  personas: e.personas,
  pedidoId: e.pedidoId ?? null,
  huesped: e.huespedDocNumero || e.huespedNombre
    ? { docTipo: e.huespedDocTipo, docNumero: e.huespedDocNumero, nombre: e.huespedNombre }
    : null
});

const serializarModalidad = (m) => ({
  id: m.id, tipo: m.tipo, horas: m.horas, precio: num(m.precio), precioVieSab: num(m.precioVieSab)
});

/**
 * Todo lo que necesita la pantalla: tipos con sus tarifas, habitaciones con
 * su estado y su estadía en curso, y por tipo cuántas quedan libres ahora y
 * esta noche (descontando las reservas web que llegan).
 */
export async function tablero(tiendaId, ahora = new Date()) {
  const [config, tipos, habitaciones, estadias, turno] = await Promise.all([
    obtenerConfig(tiendaId),
    prisma.hotel_tipos_habitacion.findMany({
      where: { tiendaId, producto: { activo: true } },
      select: {
        productoId: true, unidades: true, capacidadMax: true,
        producto: { select: { nombre: true } },
        modalidades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { precio: "asc" }] }
      },
      orderBy: { producto: { nombre: "asc" } }
    }),
    prisma.hotel_habitaciones.findMany({ where: { tiendaId }, orderBy: [{ orden: "asc" }, { numero: "asc" }] }),
    prisma.hotel_estadias.findMany({ where: { tiendaId, estado: "en_curso" } }),
    turnoAbierto(prisma, tiendaId)
  ]);

  const estadiaDe = new Map(estadias.map(e => [e.habitacionId, e]));
  const noche = primeraNoche(ahora);
  const conUnidades = tipos.filter(t => t.unidades != null);
  const [ocupadas, llegadas] = await Promise.all([
    conUnidades.length ? ocupacion(prisma, tiendaId, conUnidades, noche, noche, { ahora }) : new Map(),
    prisma.reservas.groupBy({
      by: ["productoId"],
      where: {
        tiendaId, tipo: "hotel", noches: { not: null },
        inicio: { gte: instanteLima(fechaLima(ahora), "00:00"), lt: instanteLima(sumarDias(fechaLima(ahora), 1), "00:00") },
        // Sin las que ya se registraron en el mostrador (R3.5).
        pedido: { estado: { in: ESTADOS_LLEGADA }, estadiasRecepcion: { none: {} } }
      },
      _sum: { habitaciones: true }
    })
  ]);
  const llegadasDe = new Map(llegadas.map(l => [l.productoId, l._sum.habitaciones ?? 0]));
  const [porLlegar, extras] = await Promise.all([
    reservasPorLlegar(tiendaId, ahora),
    prisma.hotel_extras.findMany({ where: { tiendaId, activo: true }, select: { id: true, nombre: true, precio: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] })
  ]);

  const salidaHabitacion = habitaciones.map(h => {
    const e = estadiaDe.get(h.id) ?? null;
    const { estado, minutos } = estadoHabitacion(h, e, ahora);
    return { id: h.id, numero: h.numero, piso: h.piso, productoId: h.productoId, estado, minutos, estadia: e ? serializarEstadia(e) : null };
  });

  return {
    ahora,
    recepcionDocumento: config.recepcionDocumento,
    horaCheckout: config.horaCheckout,
    // Caja (R5): sin turno abierto el mostrador no registra entradas ni cobros.
    caja: turno ? { abierta: true, abiertoEn: turno.abiertoEn, abiertoPor: turno.abiertoPor } : { abierta: false },
    llegadas: porLlegar,
    // Consumos del mostrador (R4.4): los extras de la tienda como atajo.
    extras: extras.map(x => ({ id: x.id, nombre: x.nombre, precio: num(x.precio) })),
    tipos: tipos.map(t => {
      const delTipo = salidaHabitacion.filter(h => h.productoId === t.productoId);
      return {
        productoId: t.productoId,
        nombre: t.producto.nombre,
        capacidadMax: t.capacidadMax,
        modalidades: t.modalidades.map(serializarModalidad),
        habitaciones: delTipo.length,
        libresAhora: delTipo.filter(h => h.estado === "libre").length,
        // Esta noche: el total menos lo vendido (web + mostrador por noche).
        libresNoche: t.unidades == null ? null : Math.max(t.unidades - (ocupadas.get(t.productoId)?.get(noche) ?? 0), 0),
        llegadasHoy: llegadasDe.get(t.productoId) ?? 0
      };
    }),
    habitaciones: salidaHabitacion
  };
}

// ---------- Reservas web que llegan (R3.5) ----------

/**
 * Reservas web por llegar: empiezan hoy (o ya empezaron y siguen vigentes),
 * están aceptadas, en revisión de pago o confirmadas, y todavía no tienen
 * estadía en el mostrador.
 */
async function reservasPorLlegar(tiendaId, ahora) {
  const manana = instanteLima(sumarDias(fechaLima(ahora), 1), "00:00");
  const reservas = await prisma.reservas.findMany({
    where: {
      tiendaId, tipo: "hotel", inicio: { lt: manana }, fin: { gt: ahora },
      pedido: { estado: { in: ESTADOS_LLEGADA }, estadiasRecepcion: { none: {} } }
    },
    select: {
      pedidoId: true, productoId: true, inicio: true, fin: true, noches: true, horas: true, habitaciones: true, adultos: true, ninos: true,
      titularNombres: true, titularApellidos: true,
      producto: { select: { nombre: true } },
      pedido: { select: { numeroPedido: true, estado: true, total: true, montoPagado: true } }
    },
    orderBy: { inicio: "asc" }
  });
  return reservas.map(r => ({
    pedidoId: r.pedidoId,
    numero: r.pedido.numeroPedido,
    estado: r.pedido.estado,
    productoId: r.productoId,
    tipo: r.producto.nombre,
    titular: `${r.titularNombres} ${r.titularApellidos}`.trim(),
    inicio: r.inicio, fin: r.fin, noches: r.noches, horas: r.horas,
    habitaciones: r.habitaciones,
    personas: (r.adultos ?? 0) + (r.ninos ?? 0),
    total: num(r.pedido.total),
    pagado: num(r.pedido.montoPagado),
    saldo: redondear(num(r.pedido.total) - num(r.pedido.montoPagado))
  }));
}

/**
 * Lo cobrado en el mostrador a una estadía que viene de una reserva web
 * también paga la reserva, hasta su saldo (los consumos del mostrador no son
 * de la reserva).
 */
async function aplicarAlPedido(tx, estadia, monto) {
  if (!estadia.pedidoId || !(monto > 0)) return;
  const pedido = await tx.pedidos.findUnique({ where: { id: estadia.pedidoId }, select: { total: true, montoPagado: true } });
  if (!pedido) return;
  const saldo = redondear(num(pedido.total) - num(pedido.montoPagado));
  if (saldo <= 0) return;
  const pagado = redondear(num(pedido.montoPagado) + Math.min(monto, saldo));
  await tx.pedidos.update({
    where: { id: estadia.pedidoId },
    data: { montoPagado: pagado, estadoPago: pagado >= num(pedido.total) ? "pagado" : "parcial" }
  });
}

/**
 * Registrar la llegada (R3.5): una estadía por habitación de la reserva. La
 * primera lleva el total de la reserva y lo ya pagado en línea; las demás van
 * en S/ 0 ("incluida"). Lo que falta se cobra aquí y queda en la caja.
 */
export async function registrarLlegada(tiendaId, pedidoId, data, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  try {
    const creadas = await prisma.$transaction(async (tx) => {
      const turno = await exigirTurno(tx, tiendaId);
      const r = await tx.reservas.findFirst({
        where: { pedidoId, tiendaId, tipo: "hotel" },
        include: { pedido: { select: { numeroPedido: true, estado: true, total: true, montoPagado: true, estadiasRecepcion: { select: { id: true } } } } }
      });
      if (!r) throw new NotFoundError("Reserva");
      if (!ESTADOS_LLEGADA.includes(r.pedido.estado)) throw conflicto("Esta reserva no está vigente (anulada, rechazada o terminada)", "RESERVA_NO_VIGENTE");
      if (r.pedido.estadiasRecepcion.length) throw conflicto("La llegada de esta reserva ya se registró", "LLEGADA_REGISTRADA");
      const ids = [...new Set(data.habitacionIds)];
      if (ids.length !== (r.habitaciones ?? 1)) {
        throw invalido(`Esta reserva es de ${r.habitaciones} ${r.habitaciones === 1 ? "habitación" : "habitaciones"}: elige ${r.habitaciones}`, "habitacionIds");
      }
      const total = num(r.pedido.total);
      const pagadoWeb = num(r.pedido.montoPagado);
      const concepto = `Reserva web ${r.pedido.numeroPedido}`;
      const salidas = [];
      for (const [i, habitacionId] of ids.entries()) {
        const h = await habitacionDeTienda(tx, tiendaId, habitacionId);
        if (h.estado !== "activa" || h.limpieza !== "limpia") throw conflicto(`La habitación ${h.numero} no está lista`, "NO_LISTA");
        const ocupada = await tx.hotel_estadias.count({ where: { habitacionId, estado: "en_curso" } });
        if (ocupada) throw conflicto(`La habitación ${h.numero} está ocupada`, "OCUPADA");
        const principal = i === 0;
        salidas.push(await tx.hotel_estadias.create({
          data: {
            tiendaId, habitacionId, productoId: h.productoId, pedidoId,
            modalidad: r.horas ? "horas" : "noche", inicio: ahora, fin: r.fin ?? r.inicio,
            cargos: [{ concepto: principal ? concepto : `${concepto} (incluida)`, precioLista: principal ? total : 0, monto: principal ? total : 0, en: ahora.toISOString(), usuario }],
            total: principal ? total : 0, pagado: principal ? pagadoWeb : 0,
            personas: principal ? (r.adultos ?? 0) + (r.ninos ?? 0) : null,
            huespedDocTipo: r.titularDocTipo, huespedDocNumero: r.titularDocNumero,
            huespedNombre: `${r.titularNombres} ${r.titularApellidos}`.trim(),
            usuarioRegistro: usuario
          }
        }));
      }
      // Cobrar el saldo al llegar (opcional).
      const saldo = redondear(total - pagadoWeb);
      if (data.cobrarAhora && saldo > 0) {
        const principal = salidas[0];
        await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: principal.id, turnoId: turno.id, monto: saldo, formaPago: data.formaPago, concepto: `Saldo ${concepto}`, fecha: ahora, usuario } });
        salidas[0] = await tx.hotel_estadias.update({ where: { id: principal.id }, data: { pagado: total } });
        await aplicarAlPedido(tx, principal, saldo);
      }
      return salidas;
    });
    return creadas.map(serializarEstadia);
  } catch (error) { throw errorOcupada(error); }
}

/** Consumo del mostrador (R4.4): gaseosa, toalla, lo que se venda. Queda con quién lo cargó. */
export async function agregarConsumo(tiendaId, id, data, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  const e = await prisma.$transaction(async (tx) => {
    const turno = await exigirTurno(tx, tiendaId);
    const actual = await estadiaEnCurso(tx, tiendaId, id);
    let concepto = data.concepto;
    let precioUnitario = data.precio;
    if (data.extraId) {
      const x = await tx.hotel_extras.findFirst({ where: { id: data.extraId, tiendaId, activo: true } });
      if (!x) throw invalido("Ese extra no existe o está pausado", "extraId");
      concepto = x.nombre;
      precioUnitario = num(x.precio);
    }
    const monto = redondear(precioUnitario * data.cantidad);
    const texto = data.cantidad > 1 ? `${data.cantidad} × ${concepto}` : concepto;
    const pagado = data.cobrarAhora ? monto : 0;
    const editada = await tx.hotel_estadias.update({
      where: { id },
      data: {
        cargos: [...actual.cargos, { concepto: texto, precioLista: monto, monto, en: ahora.toISOString(), usuario }],
        total: redondear(num(actual.total) + monto),
        pagado: redondear(num(actual.pagado) + pagado),
        fechaActualizacion: ahora, usuarioActualizacion: usuario
      }
    });
    if (pagado > 0) {
      await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: id, turnoId: turno.id, monto: pagado, formaPago: data.formaPago, concepto: texto.slice(0, 100), fecha: ahora, usuario } });
    }
    return editada;
  });
  return serializarEstadia(e);
}

// ---------- Entrada (R3) ----------

/** El documento según la regla de la tienda (R3.2). */
function validarDocumento(regla, modalidad, huesped) {
  const pide = regla === "siempre" || (regla === "noche" && modalidad.tipo === "noche");
  if (pide && !huesped?.docNumero) throw invalido("Ingresa el documento del huésped", "docNumero");
}

/** Cupo de la web para las noches que se van a ocupar: el mostrador no vende lo que ya se vendió en línea. */
async function validarCupoNoches(tx, tiendaId, productoId, fecha, noches, forzar, ahora) {
  if (forzar) return;
  const tipo = await tx.hotel_tipos_habitacion.findUnique({ where: { productoId }, select: { productoId: true, unidades: true } });
  const cupo = await cupoEstadia(tx, tiendaId, tipo, fecha, noches, { ahora });
  if (cupo && cupo.libres <= 0) {
    throw conflicto(
      "Las habitaciones de este tipo ya están vendidas para esa noche (reservas de la web). Si igual tienes lugar, registra de todos modos.",
      "SIN_CUPO_NOCHE", { libres: cupo.libres }
    );
  }
}

async function modalidadDelTipo(db, tiendaId, productoId, modalidadId) {
  const m = await db.hotel_modalidades.findFirst({ where: { id: modalidadId, productoId, tiendaId, activo: true } });
  if (!m) throw invalido("Esa tarifa no es de este tipo de habitación o está pausada", "modalidadId");
  return m;
}

function errorOcupada(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return conflicto("Esa habitación se acaba de ocupar. Elige otra.", "OCUPADA");
  }
  return error;
}

/**
 * Entrada al paso (R3.1): habitación + tarifa + cobro. El monto se puede
 * ajustar (el regateo existe); se guarda también el precio de lista.
 */
export async function registrarEntrada(tiendaId, data, user, ahora = new Date()) {
  const config = await obtenerConfig(tiendaId);
  const usuario = usuarioDe(user);
  try {
    const estadia = await prisma.$transaction(async (tx) => {
      const turno = await exigirTurno(tx, tiendaId);
      const h = await habitacionDeTienda(tx, tiendaId, data.habitacionId);
      await bloquearTipo(tx, h.productoId);
      if (h.estado !== "activa") throw conflicto("La habitación está en mantenimiento", "MANTENIMIENTO");
      if (h.limpieza !== "limpia") throw conflicto("La habitación está por limpiar: márcala como lista primero", "POR_LIMPIAR");
      const ocupada = await tx.hotel_estadias.count({ where: { habitacionId: h.id, estado: "en_curso" } });
      if (ocupada) throw conflicto("Esa habitación ya está ocupada", "OCUPADA");

      const m = await modalidadDelTipo(tx, tiendaId, h.productoId, data.modalidadId);
      validarDocumento(config.recepcionDocumento, m, data.huesped);
      const noches = m.tipo === "noche" ? data.noches ?? 1 : null;
      const c = calcularEntrada({ modalidad: m, ahora, noches: noches ?? 1, horaCheckout: config.horaCheckout });
      if (m.tipo === "noche") await validarCupoNoches(tx, tiendaId, h.productoId, primeraNoche(ahora), noches, data.forzar, ahora);

      const monto = data.monto ?? c.precioLista;
      const pagado = data.cobrarAhora ? monto : 0;
      const creada = await tx.hotel_estadias.create({
        data: {
          tiendaId, habitacionId: h.id, productoId: h.productoId, modalidad: m.tipo, inicio: ahora, fin: c.fin,
          cargos: [{ concepto: c.concepto, precioLista: c.precioLista, monto, en: ahora.toISOString(), usuario }],
          total: monto, pagado, personas: data.personas ?? null,
          huespedDocTipo: data.huesped?.docNumero ? data.huesped.docTipo ?? "DNI" : null,
          huespedDocNumero: data.huesped?.docNumero || null,
          huespedNombre: data.huesped?.nombre || null,
          usuarioRegistro: usuario
        }
      });
      if (pagado > 0) {
        await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: creada.id, turnoId: turno.id, monto: pagado, formaPago: data.formaPago, concepto: `Entrada ${c.concepto}`, fecha: ahora, usuario } });
      }
      return creada;
    });
    return serializarEstadia(estadia);
  } catch (error) { throw errorOcupada(error); }
}

// ---------- Durante y al salir (R4) ----------

async function estadiaEnCurso(tx, tiendaId, id) {
  const e = await tx.hotel_estadias.findFirst({ where: { id, tiendaId } });
  if (!e) throw new NotFoundError("Estadía");
  if (e.estado !== "en_curso") throw conflicto("Esta estadía ya terminó", "TERMINADA");
  return e;
}

/** Extender (R4.1): otro bloque de horas, pasar a noche o una noche más. */
export async function extenderEstadia(tiendaId, id, data, user, ahora = new Date()) {
  const config = await obtenerConfig(tiendaId);
  const usuario = usuarioDe(user);
  const e = await prisma.$transaction(async (tx) => {
    const turno = await exigirTurno(tx, tiendaId);
    const actual = await estadiaEnCurso(tx, tiendaId, id);
    await bloquearTipo(tx, actual.productoId);
    const m = await modalidadDelTipo(tx, tiendaId, actual.productoId, data.modalidadId);
    const c = calcularExtension({ estadia: actual, modalidad: m, horaCheckout: config.horaCheckout });
    if (m.tipo === "noche") {
      // La noche que se suma: la última que cubre la estadía extendida.
      await validarCupoNoches(tx, tiendaId, actual.productoId, sumarDias(fechaLima(c.fin), -1), 1, data.forzar, ahora);
    }
    const monto = data.monto ?? c.precioLista;
    const pagado = data.cobrarAhora ? monto : 0;
    const editada = await tx.hotel_estadias.update({
      where: { id },
      data: {
        fin: c.fin, modalidad: c.modalidad,
        cargos: [...actual.cargos, { concepto: c.concepto, precioLista: c.precioLista, monto, en: ahora.toISOString(), usuario }],
        total: redondear(num(actual.total) + monto),
        pagado: redondear(num(actual.pagado) + pagado),
        fechaActualizacion: ahora, usuarioActualizacion: usuario
      }
    });
    if (pagado > 0) {
      await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: id, turnoId: turno.id, monto: pagado, formaPago: data.formaPago, concepto: c.concepto, fecha: ahora, usuario } });
      await aplicarAlPedido(tx, actual, pagado);
    }
    return editada;
  });
  return serializarEstadia(e);
}

/** Cobra lo que falta (R3.3 "por cobrar"). */
export async function cobrarSaldo(tiendaId, id, { formaPago }, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  const e = await prisma.$transaction(async (tx) => {
    const actual = await estadiaEnCurso(tx, tiendaId, id);
    const saldo = redondear(num(actual.total) - num(actual.pagado));
    if (saldo <= 0) throw conflicto("No hay nada por cobrar", "SIN_SALDO");
    const turno = await exigirTurno(tx, tiendaId);
    await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: id, turnoId: turno.id, monto: saldo, formaPago, concepto: "Saldo", fecha: ahora, usuario } });
    await aplicarAlPedido(tx, actual, saldo);
    return tx.hotel_estadias.update({ where: { id }, data: { pagado: num(actual.total), fechaActualizacion: ahora, usuarioActualizacion: usuario } });
  });
  return serializarEstadia(e);
}

/**
 * Cambiar de habitación (R4.2): la nueva tiene que estar libre y limpia; la
 * anterior queda por limpiar. Si cambia el tipo, el precio no se recalcula:
 * la diferencia se cobra con "Extender" o se ajusta a mano (fase 3).
 */
export async function cambiarHabitacion(tiendaId, id, { habitacionId }, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  try {
    const e = await prisma.$transaction(async (tx) => {
      const actual = await estadiaEnCurso(tx, tiendaId, id);
      if (actual.habitacionId === habitacionId) throw invalido("Ya está en esa habitación", "habitacionId");
      const nueva = await habitacionDeTienda(tx, tiendaId, habitacionId);
      if (nueva.estado !== "activa" || nueva.limpieza !== "limpia") throw conflicto("La habitación nueva no está lista", "NO_LISTA");
      const ocupada = await tx.hotel_estadias.count({ where: { habitacionId, estado: "en_curso" } });
      if (ocupada) throw conflicto("La habitación nueva está ocupada", "OCUPADA");
      await tx.hotel_habitaciones.update({ where: { id: actual.habitacionId }, data: { limpieza: "por_limpiar", fechaActualizacion: ahora, usuarioActualizacion: usuario } });
      return tx.hotel_estadias.update({
        where: { id },
        data: { habitacionId, productoId: nueva.productoId, fechaActualizacion: ahora, usuarioActualizacion: usuario }
      });
    });
    return serializarEstadia(e);
  } catch (error) { throw errorOcupada(error); }
}

/**
 * Salida (R4.3): libera la habitación y la deja por limpiar. Con saldo
 * pendiente hay que cobrarlo (se manda la forma de pago) antes de liberar.
 */
export async function registrarSalida(tiendaId, id, { formaPago } = {}, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  const e = await prisma.$transaction(async (tx) => {
    const actual = await estadiaEnCurso(tx, tiendaId, id);
    const saldo = redondear(num(actual.total) - num(actual.pagado));
    if (saldo > 0 && !formaPago) {
      throw conflicto(`Falta cobrar S/ ${saldo.toFixed(2)} antes de la salida`, "SALDO_PENDIENTE", { saldo });
    }
    if (saldo > 0) {
      const turno = await exigirTurno(tx, tiendaId);
      await tx.hotel_cobros.create({ data: { tiendaId, estadiaId: id, turnoId: turno.id, monto: saldo, formaPago, concepto: "Saldo al salir", fecha: ahora, usuario } });
      await aplicarAlPedido(tx, actual, saldo);
    }
    await tx.hotel_habitaciones.update({ where: { id: actual.habitacionId }, data: { limpieza: "por_limpiar", fechaActualizacion: ahora, usuarioActualizacion: usuario } });
    return tx.hotel_estadias.update({
      where: { id },
      data: { estado: "cerrada", salida: ahora, pagado: num(actual.total), fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
  });
  return serializarEstadia(e);
}

/** Anular (solo admin): un error de registro. Queda con motivo y no se borra. */
export async function anularEstadia(tiendaId, id, { motivo }, user, ahora = new Date()) {
  const usuario = usuarioDe(user);
  const e = await prisma.$transaction(async (tx) => {
    await estadiaEnCurso(tx, tiendaId, id);
    return tx.hotel_estadias.update({
      where: { id },
      data: { estado: "anulada", salida: ahora, motivoAnulacion: motivo, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
  });
  return serializarEstadia(e);
}

/** Limpieza (R2.1): "Lista". */
export async function marcarLimpia(tiendaId, habitacionId, user, ahora = new Date()) {
  await habitacionDeTienda(prisma, tiendaId, habitacionId);
  await prisma.hotel_habitaciones.update({
    where: { id: habitacionId },
    data: { limpieza: "limpia", fechaActualizacion: ahora, usuarioActualizacion: usuarioDe(user) }
  });
  return { id: habitacionId, limpieza: "limpia" };
}

// ---------- Vitrina "ahora" (R8, fase 4) ----------

/**
 * Lo que ve el cliente que pasa por la puerta o busca en el celular: cada tipo
 * con sus tarifas y si hay una habitación libre en este momento (activa,
 * limpia y sin estadía). Sin cantidades: solo sí o no.
 */
export async function ahoraPublico(tiendaId, lang = IDIOMA_BASE) {
  const [tipos, habitaciones, ocupadas] = await Promise.all([
    listarHabitacionesStore(tiendaId, lang),
    prisma.hotel_habitaciones.findMany({ where: { tiendaId, estado: "activa" }, select: { id: true, productoId: true, limpieza: true } }),
    prisma.hotel_estadias.findMany({ where: { tiendaId, estado: "en_curso" }, select: { habitacionId: true } })
  ]);
  const enUso = new Set(ocupadas.map(e => e.habitacionId));
  const libres = new Map();
  for (const h of habitaciones) {
    if (h.limpieza === "limpia" && !enUso.has(h.id)) libres.set(h.productoId, (libres.get(h.productoId) ?? 0) + 1);
  }
  const conRecepcion = habitaciones.length > 0;
  const conHabitaciones = new Set(habitaciones.map(h => h.productoId));
  return {
    actualizado: new Date(),
    conRecepcion,
    tipos: tipos
      .filter(t => !conRecepcion || conHabitaciones.has(t.id))
      .map(t => ({
        id: t.id, nombre: t.nombre, slug: t.slug, descripcionCorta: t.descripcionCorta, imagen: t.imagenes[0] ?? null,
        camas: t.camas, amenities: t.amenities, capacidadMax: t.capacidadMax,
        tarifas: t.modalidades.map(m => ({ tipo: m.tipo, horas: m.horas, etiqueta: m.etiqueta, precio: m.precio, precioVieSab: m.precioVieSab })),
        // Sin Recepción no se sabe: null.
        disponible: conRecepcion ? (libres.get(t.id) ?? 0) > 0 : null
      }))
  };
}
