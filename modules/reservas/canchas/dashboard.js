import { prisma } from "../../../config/prisma.js";
import { contador, kpi, pct, redondear2 } from "../../dashboard/widgets.js";
import { cobrosDe } from "../../dashboard/piezas/cobros.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { diaSemana, fechaLima, horaLima, instanteLima, rangoFechas, sumarDias } from "../tiempo.js";
import { agendaAdmin } from "./canchas.service.js";
import { minutosCierre, minutosHora } from "./tarifa.js";

/**
 * Widgets del complejo de canchas (docs/specs/dashboard-por-rubro): se venden
 * horas, así que la ocupación es horas reservadas ÷ horas abiertas.
 * Sin «turnos fijos» (decisión 4): el fijo semanal no se guarda como tal.
 */
const MS_MIN = 60 * 1000;
const minutosEntre = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / MS_MIN);

const agendaDe = (ctx) => ctx.memo("canchas_agenda", () => agendaAdmin(ctx.tiendaId, ctx.periodo.hoy, ctx.ahora));
const configDe = (ctx) => ctx.memo("canchas_config", () => obtenerConfig(ctx.tiendaId));
const canchasActivasDe = (ctx) => ctx.memo("canchas_activas", () =>
  prisma.cancha_canchas.count({ where: { tiendaId: ctx.tiendaId, producto: { activo: true } } }));

/** Minutos que el complejo está abierto en un día, por cancha. */
const minutosAbiertos = (config) => minutosCierre(config.canchaCierre) - minutosHora(config.canchaApertura);

/** Minutos de una ocupación dentro de [desde, hasta) del día (en minutos desde las 00:00). */
const minutosEnFranja = (o, desde, hasta) =>
  Math.max(0, Math.min(minutosCierre(o.hasta), hasta) - Math.max(minutosHora(o.desde), desde));

// ---------- Atención ----------

export const apartados = contador("apartados", "Apartados esperando adelanto", "warn", "/canchas/agenda",
  (ctx) => prisma.cancha_ocupaciones.count({ where: { tiendaId: ctx.tiendaId, tipo: "apartado", activo: true, expiraEn: { gt: ctx.ahora } } }));

export const bloqueosHoy = contador("bloqueos_hoy", "Bloqueos de hoy", "info", "/canchas/agenda",
  (ctx) => prisma.cancha_ocupaciones.count({
    where: {
      tiendaId: ctx.tiendaId, tipo: "bloqueo", activo: true,
      inicio: { lt: instanteLima(sumarDias(ctx.periodo.hoy, 1)) }, fin: { gt: instanteLima(ctx.periodo.hoy) }
    }
  }));

// ---------- Hoy ----------

const canchasAbiertasHoy = (agenda) => agenda.canchas.filter((c) => c.activo && !c.cerrada);
const reservasDe = (cancha) => cancha.ocupaciones.filter((o) => o.tipo === "reserva");

export const ocupacionHoy = async (ctx) => {
  const agenda = await agendaDe(ctx);
  const canchas = canchasAbiertasHoy(agenda);
  if (!canchas.length) return null;
  const abiertos = canchas.length * minutosAbiertos({ canchaApertura: agenda.horario.apertura, canchaCierre: agenda.horario.cierre });
  const reservados = canchas.reduce((s, c) => s + reservasDe(c).reduce((m, o) => m + minutosEnFranja(o, 0, 24 * 60), 0), 0);
  return kpi("ocupacion_hoy", "Ocupación hoy", pct(reservados, abiertos), "pct", {
    destacado: true, detalle: `${Math.round(reservados / 60)} de ${Math.round(abiertos / 60)} horas`
  });
};

export const ingresosHoy = async (ctx) => {
  const cobros = await cobrosDe(ctx);
  return kpi("ingresos_hoy", "Ingresos de hoy", redondear2(cobros.get(ctx.periodo.hoy) ?? 0), "PEN");
};

export const proximoTurno = async (ctx) => {
  const agenda = await agendaDe(ctx);
  const ahora = horaLima(ctx.ahora);
  const proximo = canchasAbiertasHoy(agenda)
    .flatMap((c) => reservasDe(c).filter((o) => o.desde > ahora).map((o) => ({ ...o, cancha: c.nombre })))
    .sort((a, b) => a.desde.localeCompare(b.desde))[0];
  return kpi("proximo_turno", "Próximo turno", proximo?.desde ?? "—", "texto",
    { detalle: proximo ? [proximo.cancha, proximo.pedido?.cliente].filter(Boolean).join(" · ") : "No quedan turnos hoy" });
};

/** Horas libres de la franja de noche (la más vendida) que quedan hoy. */
export const horasLibresNoche = async (ctx) => {
  const agenda = await agendaDe(ctx);
  const canchas = canchasAbiertasHoy(agenda);
  if (!canchas.length || !agenda.horario.inicioNoche) return null;
  const desde = Math.max(minutosHora(agenda.horario.inicioNoche), minutosHora(horaLima(ctx.ahora)));
  const hasta = minutosCierre(agenda.horario.cierre);
  if (desde >= hasta) return null;
  const libres = canchas.reduce((s, c) => s + (hasta - desde) - c.ocupaciones.reduce((m, o) => m + minutosEnFranja(o, desde, hasta), 0), 0);
  return kpi("libres_noche", "Horas libres esta noche", Math.max(0, Math.floor(libres / 60)), "num", { detalle: `Desde las ${agenda.horario.inicioNoche}` });
};

export const agendaHoy = async (ctx) => {
  const agenda = await agendaDe(ctx);
  const canchas = agenda.canchas.filter((c) => c.activo);
  if (!canchas.length) return null;
  const texto = (o) => o.tipo === "bloqueo" ? (o.motivo ?? "Bloqueo") : o.tipo === "apartado" ? "Apartado" : (o.pedido?.cliente ?? o.pedido?.codigo ?? "Reserva");
  return {
    tipo: "agenda", id: "agenda", titulo: "Agenda de hoy", ruta: "/canchas/agenda", ancho: "completo",
    apertura: agenda.horario.apertura, cierre: agenda.horario.cierre, ahora: horaLima(ctx.ahora),
    filas: canchas.map((c) => ({
      nombre: c.nombre,
      detalle: c.cerrada ? "Cerrada hoy" : c.formato,
      bloques: c.ocupaciones.map((o) => ({ desde: o.desde, hasta: o.hasta, tipo: o.tipo, texto: texto(o) }))
    }))
  };
};

// ---------- Periodo ----------

/** Reservas de cancha de los 60 días (ocupación activa), con su cliente. */
const reservasDe60 = (ctx) => ctx.memo("canchas_reservas", () => prisma.cancha_ocupaciones.findMany({
  where: { tiendaId: ctx.tiendaId, tipo: "reserva", activo: true, inicio: { gte: ctx.periodo.anteriorDesde, lt: ctx.periodo.hasta } },
  select: { inicio: true, fin: true, pedido: { select: { authUserId: true, clienteWhatsapp: true, clienteNombre: true } } }
}));

const horasPorPeriodo = (ctx, filas) => {
  let valor = 0, anterior = 0;
  for (const o of filas) {
    const min = minutosEntre(o.inicio, o.fin);
    if (o.inicio >= ctx.periodo.desde) valor += min; else anterior += min;
  }
  return { valor: Math.round(valor / 60), anterior: Math.round(anterior / 60) };
};

export const horasVendidas = async (ctx) => {
  const { valor, anterior } = horasPorPeriodo(ctx, await reservasDe60(ctx));
  return kpi("horas_vendidas", "Horas vendidas", valor, "num", { anterior });
};

export const ocupacionPeriodo = async (ctx) => {
  const [config, canchas] = await Promise.all([configDe(ctx), canchasActivasDe(ctx)]);
  if (!canchas) return null;
  const capacidad = (canchas * minutosAbiertos(config) * ctx.periodo.dias) / 60;
  const { valor, anterior } = horasPorPeriodo(ctx, await reservasDe60(ctx));
  return kpi("ocupacion", "Ocupación", pct(valor, capacidad), "pct", { anterior: pct(anterior, capacidad) });
};

/** Clientes del periodo que jugaron 2 o más veces (reemplaza a «turnos fijos», decisión 4). */
export const clientesQueRepiten = async (ctx) => {
  const veces = new Map();
  for (const o of await reservasDe60(ctx)) {
    if (o.inicio < ctx.periodo.desde || !o.pedido) continue;
    const quien = o.pedido.authUserId ?? o.pedido.clienteWhatsapp ?? o.pedido.clienteNombre;
    if (quien) veces.set(quien, (veces.get(quien) ?? 0) + 1);
  }
  if (!veces.size) return null;
  const repiten = [...veces.values()].filter((n) => n >= 2).length;
  return kpi("repiten", "Clientes que repiten", pct(repiten, veces.size), "pct", { detalle: `${repiten} de ${veces.size} jugaron 2 o más veces` });
};

/** Ocupación por día de la semana y hora en las últimas 4 semanas. */
export const mapaDeCalor = async (ctx) => {
  const [config, canchas] = await Promise.all([configDe(ctx), canchasActivasDe(ctx)]);
  if (!canchas) return null;
  const apertura = minutosHora(config.canchaApertura), cierre = minutosCierre(config.canchaCierre);
  const horas = [];
  for (let m = Math.floor(apertura / 60) * 60; m < cierre; m += 60) horas.push(m);
  const fechas = rangoFechas(sumarDias(ctx.periodo.hoy, -28), sumarDias(ctx.periodo.hoy, -1));
  // Lunes primero: fila = (diaSemana + 6) % 7.
  const minutos = Array.from({ length: 7 }, () => horas.map(() => 0));
  const desde = instanteLima(fechas[0]), hasta = instanteLima(ctx.periodo.hoy);
  for (const o of await reservasDe60(ctx)) {
    if (o.inicio < desde || o.inicio >= hasta) continue;
    const fila = (diaSemana(fechaLima(o.inicio)) + 6) % 7;
    const ini = minutosHora(horaLima(o.inicio));
    const fin = ini + minutosEntre(o.inicio, o.fin);
    horas.forEach((h, i) => { minutos[fila][i] += Math.max(0, Math.min(fin, h + 60) - Math.max(ini, h)); });
  }
  // Cada día de la semana aparece 4 veces en las 4 semanas.
  const capacidad = canchas * 60 * 4;
  return {
    tipo: "mapa_calor", id: "mapa_calor", titulo: "¿Qué horas se llenan?", subtitulo: "Ocupación promedio por hora · 4 semanas", ruta: "/reservas/configuracion", ancho: "completo",
    filas: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    columnas: horas.map((h) => `${String(h / 60).padStart(2, "0")}h`),
    valores: minutos.map((fila) => fila.map((m) => Math.min(1, Math.round((m / capacidad) * 100) / 100)))
  };
};
