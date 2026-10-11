import { prisma, Prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../../utils/errors.js";
import { descuentos, resumenCaja } from "./recepcion.js";

/**
 * Recepción, fase 2 (docs/specs/recepcion R5): caja por turno, gastos e
 * ingresos, cierre con arqueo e incidencias ("uso sin registrar").
 *
 * Un solo cajón por tienda: a lo más un turno abierto. Mientras está abierto,
 * cada cobro del mostrador queda en él. El cierre es **ciego** para quien no
 * es admin: cuenta el efectivo sin ver cuánto debería haber, así no puede
 * acomodar el conteo; el esperado y la diferencia los ve el dueño.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));
const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const conflicto = (message, motivo) => new ConflictError(message, { message, motivo });
/** Ven el esperado, la diferencia y los reportes. */
export const esGestion = (rol) => ["admin", "owner"].includes(rol);

export async function turnoAbierto(db, tiendaId) {
  return db.hotel_turnos.findFirst({ where: { tiendaId, estado: "abierto" } });
}

/** Lo que se cobra o se registra en el mostrador necesita la caja abierta. */
export async function exigirTurno(db, tiendaId) {
  const turno = await turnoAbierto(db, tiendaId);
  if (!turno) throw conflicto("Abre la caja para registrar entradas y cobros", "CAJA_CERRADA");
  return turno;
}

const serializarTurno = (t) => ({
  id: t.id,
  estado: t.estado,
  abiertoEn: t.abiertoEn,
  abiertoPor: t.abiertoPor,
  montoInicial: num(t.montoInicial),
  cerradoEn: t.cerradoEn,
  cerradoPor: t.cerradoPor
});

/** Con cifras: solo para admin/owner. */
const serializarTurnoCompleto = (t) => ({
  ...serializarTurno(t),
  efectivoEsperado: num(t.efectivoEsperado),
  efectivoContado: num(t.efectivoContado),
  diferencia: num(t.diferencia),
  nota: t.nota,
  resumen: t.resumen
});

async function datosDelTurno(db, turno) {
  const [cobros, movimientos] = await Promise.all([
    db.hotel_cobros.findMany({
      where: { turnoId: turno.id },
      include: { estadia: { select: { habitacion: { select: { numero: true } } } } },
      orderBy: { fecha: "asc" }
    }),
    db.hotel_caja_movimientos.findMany({ where: { turnoId: turno.id }, orderBy: { fecha: "asc" } })
  ]);
  return { cobros, movimientos };
}

/** Lo que pasó en el mostrador mientras el turno estuvo abierto: entradas, descuentos, anulaciones, incidencias. */
async function actividadDelTurno(db, turno, hasta) {
  const ventana = { gte: turno.abiertoEn, lte: hasta };
  const [entradas, conCargos, anuladas, incidencias] = await Promise.all([
    db.hotel_estadias.findMany({ where: { tiendaId: turno.tiendaId, inicio: ventana }, select: { modalidad: true } }),
    db.hotel_estadias.findMany({
      where: { tiendaId: turno.tiendaId, OR: [{ inicio: ventana }, { fechaActualizacion: ventana }] },
      select: { id: true, cargos: true, habitacion: { select: { numero: true } } }
    }),
    db.hotel_estadias.findMany({
      where: { tiendaId: turno.tiendaId, estado: "anulada", fechaActualizacion: ventana },
      select: { id: true, motivoAnulacion: true, pagado: true, usuarioActualizacion: true, fechaActualizacion: true, habitacion: { select: { numero: true } } }
    }),
    db.hotel_incidencias.findMany({
      where: { tiendaId: turno.tiendaId, fecha: ventana },
      select: { id: true, tipo: true, nota: true, fecha: true, usuario: true, habitacion: { select: { numero: true } } }
    })
  ]);
  const enVentana = (c) => new Date(c.en) >= turno.abiertoEn && new Date(c.en) <= hasta;
  return {
    entradas: { total: entradas.length, porHoras: entradas.filter(e => e.modalidad === "horas").length, porNoche: entradas.filter(e => e.modalidad === "noche").length },
    descuentos: conCargos.flatMap(e => descuentos((e.cargos ?? []).filter(enVentana)).map(d => ({ habitacion: e.habitacion.numero, ...d }))),
    anuladas: anuladas.map(a => ({ habitacion: a.habitacion.numero, motivo: a.motivoAnulacion, pagado: num(a.pagado), usuario: a.usuarioActualizacion, fecha: a.fechaActualizacion })),
    incidencias: incidencias.map(i => ({ ...i, habitacion: i.habitacion.numero }))
  };
}

/** Ingreso por habitación en el turno (R5.5). */
function porHabitacion(cobros) {
  const mapa = new Map();
  for (const c of cobros) {
    const n = c.estadia?.habitacion?.numero ?? "?";
    mapa.set(n, Math.round(((mapa.get(n) ?? 0) + Number(c.monto)) * 100) / 100);
  }
  return [...mapa.entries()].map(([habitacion, total]) => ({ habitacion, total })).sort((a, b) => b.total - a.total);
}

// ---------- Turno ----------

/** Estado de la caja para el mostrador. Sin cifras para quien no es admin (cierre ciego). */
export async function estadoCaja(tiendaId, rol) {
  const turno = await turnoAbierto(prisma, tiendaId);
  if (!turno) return { turno: null };
  if (!esGestion(rol)) return { turno: serializarTurno(turno) };
  const { cobros, movimientos } = await datosDelTurno(prisma, turno);
  return { turno: serializarTurno(turno), resumen: resumenCaja({ montoInicial: turno.montoInicial, cobros, movimientos }) };
}

export async function abrirTurno(tiendaId, { montoInicial }, user) {
  try {
    const turno = await prisma.hotel_turnos.create({ data: { tiendaId, montoInicial, abiertoPor: usuarioDe(user) } });
    return serializarTurno(turno);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflicto("Ya hay una caja abierta: ciérrala antes de abrir otra", "CAJA_ABIERTA");
    }
    throw error;
  }
}

export async function registrarMovimiento(tiendaId, { tipo, monto, motivo }, user) {
  const turno = await exigirTurno(prisma, tiendaId);
  const m = await prisma.hotel_caja_movimientos.create({ data: { tiendaId, turnoId: turno.id, tipo, monto, motivo, usuario: usuarioDe(user) } });
  return { id: m.id, tipo: m.tipo, monto: num(m.monto), motivo: m.motivo, fecha: m.fecha };
}

/**
 * Cierre (R5.3): guarda lo contado, lo esperado, la diferencia y una foto del
 * turno. A quien no es admin no se le devuelven las cifras.
 */
export async function cerrarTurno(tiendaId, { efectivoContado, nota }, user, rol, ahora = new Date()) {
  const cerrado = await prisma.$transaction(async (tx) => {
    const turno = await exigirTurno(tx, tiendaId);
    const { cobros, movimientos } = await datosDelTurno(tx, turno);
    const resumen = resumenCaja({ montoInicial: turno.montoInicial, cobros, movimientos });
    const actividad = await actividadDelTurno(tx, turno, ahora);
    const diferencia = Math.round((efectivoContado - resumen.efectivoEsperado) * 100) / 100;
    const { count } = await tx.hotel_turnos.updateMany({
      where: { id: turno.id, estado: "abierto" },
      data: {
        estado: "cerrado", cerradoEn: ahora, cerradoPor: usuarioDe(user),
        efectivoEsperado: resumen.efectivoEsperado, efectivoContado, diferencia, nota: nota ?? null,
        resumen: { ...resumen, porHabitacion: porHabitacion(cobros), entradas: actividad.entradas, descuentos: actividad.descuentos.length, anuladas: actividad.anuladas.length, incidencias: actividad.incidencias.length }
      }
    });
    if (!count) throw conflicto("La caja ya se cerró", "CAJA_CERRADA");
    return tx.hotel_turnos.findUnique({ where: { id: turno.id } });
  });
  return esGestion(rol) ? serializarTurnoCompleto(cerrado) : serializarTurno(cerrado);
}

// ---------- Reportes del dueño (R5.4) ----------

export async function listarTurnos(tiendaId, { limite = 30 } = {}) {
  const turnos = await prisma.hotel_turnos.findMany({ where: { tiendaId }, orderBy: { abiertoEn: "desc" }, take: limite });
  return Promise.all(turnos.map(async (t) => {
    if (t.estado === "cerrado") return serializarTurnoCompleto(t);
    const { cobros, movimientos } = await datosDelTurno(prisma, t);
    return { ...serializarTurnoCompleto(t), resumen: resumenCaja({ montoInicial: t.montoInicial, cobros, movimientos }) };
  }));
}

export async function detalleTurno(tiendaId, id, ahora = new Date()) {
  const turno = await prisma.hotel_turnos.findFirst({ where: { id, tiendaId } });
  if (!turno) throw new NotFoundError("Turno");
  const { cobros, movimientos } = await datosDelTurno(prisma, turno);
  const actividad = await actividadDelTurno(prisma, turno, turno.cerradoEn ?? ahora);
  return {
    ...serializarTurnoCompleto(turno),
    resumen: turno.resumen ?? resumenCaja({ montoInicial: turno.montoInicial, cobros, movimientos }),
    porHabitacion: porHabitacion(cobros),
    cobros: cobros.map(c => ({
      id: c.id, fecha: c.fecha, habitacion: c.estadia?.habitacion?.numero ?? null, concepto: c.concepto,
      formaPago: c.formaPago, monto: num(c.monto), usuario: c.usuario
    })),
    movimientos: movimientos.map(m => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, monto: num(m.monto), motivo: m.motivo, usuario: m.usuario })),
    ...actividad
  };
}

// ---------- Incidencias (R5.5) ----------

/**
 * "Encontré la habitación usada": figuraba libre y limpia pero alguien la
 * usó sin registrar la entrada. Queda por limpiar y el dueño lo ve.
 */
export async function reportarUsoSinRegistrar(tiendaId, habitacionId, { nota }, user, ahora = new Date()) {
  return prisma.$transaction(async (tx) => {
    const h = await tx.hotel_habitaciones.findFirst({ where: { id: habitacionId, tiendaId } });
    if (!h) throw new NotFoundError("Habitación");
    const enCurso = await tx.hotel_estadias.count({ where: { habitacionId, estado: "en_curso" } });
    if (enCurso) throw conflicto("La habitación tiene una estadía registrada: no es un uso sin registrar", "OCUPADA");
    const usuario = usuarioDe(user);
    await tx.hotel_habitaciones.update({ where: { id: habitacionId }, data: { limpieza: "por_limpiar", fechaActualizacion: ahora, usuarioActualizacion: usuario } });
    const i = await tx.hotel_incidencias.create({ data: { tiendaId, habitacionId, tipo: "uso_sin_registrar", nota: nota ?? null, fecha: ahora, usuario } });
    return { id: i.id, tipo: i.tipo, fecha: i.fecha };
  });
}

export async function listarIncidencias(tiendaId, { pendientes = false } = {}) {
  const lista = await prisma.hotel_incidencias.findMany({
    where: { tiendaId, ...(pendientes ? { revisadaEn: null } : {}) },
    include: { habitacion: { select: { numero: true } } },
    orderBy: { fecha: "desc" },
    take: 100
  });
  return lista.map(i => ({
    id: i.id, tipo: i.tipo, nota: i.nota, fecha: i.fecha, usuario: i.usuario, habitacion: i.habitacion.numero,
    revisadaEn: i.revisadaEn, revisadaPor: i.revisadaPor
  }));
}

export async function marcarIncidenciaRevisada(tiendaId, id, user, ahora = new Date()) {
  const { count } = await prisma.hotel_incidencias.updateMany({
    where: { id, tiendaId, revisadaEn: null },
    data: { revisadaEn: ahora, revisadaPor: usuarioDe(user) }
  });
  if (!count) throw new NotFoundError("Incidencia pendiente");
  return { id, revisadaEn: ahora };
}
