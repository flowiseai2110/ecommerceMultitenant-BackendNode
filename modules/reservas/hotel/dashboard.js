import { prisma } from "../../../config/prisma.js";
import { contador, kpi, pct, redondear2 } from "../../dashboard/widgets.js";
import { etiquetaDiaSemana, proximosDias } from "../../dashboard/periodo.js";
import { fechaLima, horaLima, instanteLima, rangoFechas, sumarDias } from "../tiempo.js";
import { nochesDe, ocupacion, unidadesDe } from "./disponibilidad.service.js";
import { ocupaNoche, primeraNoche } from "./recepcion.js";
import { tablero } from "./recepcion.service.js";

/**
 * Widgets del hotel (docs/specs/dashboard-por-rubro). La ocupación usa el
 * inventario (`unidades` del tipo): sin inventario no hay porcentaje. El mapa
 * de habitaciones sale del tablero de Recepción y solo existe con habitaciones.
 */
const ESTADOS_LLEGADA = ["aceptada", "pago_en_revision", "confirmada", "completada"];
const ESTADOS_VENDIDAS = ["confirmada", "completada"];

const tiposDe = (ctx) => ctx.memo("hotel_tipos", () => prisma.hotel_tipos_habitacion.findMany({
  where: { tiendaId: ctx.tiendaId, producto: { activo: true } },
  select: { productoId: true, unidades: true, producto: { select: { nombre: true } } }
}));

/** Tipos con inventario y su total de unidades (habitaciones o camas). */
async function inventario(ctx) {
  const conUnidades = (await tiposDe(ctx)).filter((t) => t.unidades != null);
  return { conUnidades, total: conUnidades.reduce((s, t) => s + t.unidades, 0) };
}

/** Unidades ocupadas por fecha (suma de todos los tipos) entre desde y hasta. */
async function ocupadasPorFecha(ctx, desde, hasta) {
  const { conUnidades } = await inventario(ctx);
  if (!conUnidades.length) return new Map();
  const porTipo = await ocupacion(prisma, ctx.tiendaId, conUnidades, desde, hasta, { ahora: ctx.ahora });
  const total = new Map();
  for (const porFecha of porTipo.values()) {
    for (const [f, n] of porFecha) total.set(f, (total.get(f) ?? 0) + n);
  }
  return total;
}

const tableroDe = (ctx) => ctx.memo("hotel_tablero", () => tablero(ctx.tiendaId, ctx.ahora));

// ---------- Atención ----------

export const porLimpiar = contador("por_limpiar", "Habitaciones por limpiar", "info", "/recepcion",
  (ctx) => prisma.hotel_habitaciones.count({ where: { tiendaId: ctx.tiendaId, estado: "activa", limpieza: "por_limpiar" } }));

export const salidasVencidas = contador("salida_vencida", "Salidas vencidas sin cerrar", "crit", "/recepcion",
  (ctx) => prisma.hotel_estadias.count({ where: { tiendaId: ctx.tiendaId, estado: "en_curso", fin: { lt: ctx.ahora } } }));

// ---------- Hoy ----------

export const ocupacionNoche = async (ctx) => {
  const { total } = await inventario(ctx);
  if (!total) return null;
  const noche = primeraNoche(ctx.ahora);
  const ocupadas = Math.min((await ocupadasPorFecha(ctx, noche, noche)).get(noche) ?? 0, total);
  return kpi("ocupacion_noche", "Ocupación esta noche", pct(ocupadas, total), "pct", { detalle: `${ocupadas} de ${total}`, destacado: true });
};

const rangoHoy = (ctx) => ({ gte: instanteLima(ctx.periodo.hoy), lt: instanteLima(sumarDias(ctx.periodo.hoy, 1)) });

const llegadasHoyDe = (ctx) => ctx.memo("hotel_llegadas", () => prisma.reservas.findMany({
  where: { tiendaId: ctx.tiendaId, tipo: "hotel", noches: { not: null }, inicio: rangoHoy(ctx), pedido: { estado: { in: ESTADOS_LLEGADA } } },
  orderBy: { inicio: "asc" },
  select: {
    inicio: true, noches: true, habitaciones: true, titularNombres: true, titularApellidos: true,
    producto: { select: { nombre: true } },
    pedido: { select: { id: true, estadoPago: true, estadiasRecepcion: { select: { id: true }, take: 1 } } }
  }
}));

export const llegadas = async (ctx) => {
  const filas = await llegadasHoyDe(ctx);
  const ingresaron = filas.filter((r) => r.pedido.estadiasRecepcion.length).length;
  return kpi("llegadas", "Llegadas", filas.length, "num", filas.length ? { detalle: `${ingresaron} ya ingresaron` } : {});
};

export const salidas = async (ctx) => {
  const hoy = rangoHoy(ctx);
  const [mostrador, web] = await Promise.all([
    prisma.hotel_estadias.count({ where: { tiendaId: ctx.tiendaId, estado: "en_curso", fin: { lt: hoy.lt } } }),
    // Hotel sin Recepción: la salida de la reserva web.
    prisma.reservas.count({
      where: { tiendaId: ctx.tiendaId, tipo: "hotel", fin: hoy, pedido: { estado: { in: ESTADOS_VENDIDAS }, estadiasRecepcion: { none: {} } } }
    })
  ]);
  return kpi("salidas", "Salidas", mostrador + web, "num");
};

export const enCasa = async (ctx) => {
  const [mostrador, web] = await Promise.all([
    prisma.hotel_estadias.count({ where: { tiendaId: ctx.tiendaId, estado: "en_curso" } }),
    prisma.reservas.count({
      where: {
        tiendaId: ctx.tiendaId, tipo: "hotel", inicio: { lte: ctx.ahora }, fin: { gt: ctx.ahora },
        pedido: { estado: { in: ESTADOS_VENDIDAS }, estadiasRecepcion: { none: {} } }
      }
    })
  ]);
  return kpi("en_casa", "Estadías en curso", mostrador + web, "num");
};

/** Mapa de habitaciones: solo con habitaciones físicas (Recepción). */
export const mapaHabitaciones = async (ctx) => {
  const { habitaciones, tipos } = await tableroDe(ctx);
  if (!habitaciones.length) return null;
  const nombreTipo = new Map(tipos.map((t) => [t.productoId, t.nombre]));
  return {
    tipo: "habitaciones", id: "habitaciones", titulo: "Habitaciones", subtitulo: "Estado ahora", ruta: "/recepcion", ancho: "ancho",
    items: habitaciones.map((h) => ({
      numero: h.numero,
      tipo: nombreTipo.get(h.productoId) ?? "",
      estado: h.estado,
      ...(h.estadia ? { detalle: `Sale ${horaLima(new Date(h.estadia.fin))}` } : {})
    }))
  };
};

const ESTADO_LLEGADA = (r) => {
  if (r.pedido.estadiasRecepcion.length) return { tono: "ok", texto: "Ingresó" };
  if (r.pedido.estadoPago === "pagado") return { tono: "ok", texto: "Pagado" };
  if (r.pedido.estadoPago === "parcial") return { tono: "warn", texto: "Con saldo" };
  return { tono: "info", texto: "Por pagar" };
};

export const listaLlegadas = async (ctx) => {
  const filas = await llegadasHoyDe(ctx);
  return {
    tipo: "lista", id: "llegadas_hoy", titulo: "Llegadas de hoy", ruta: "/reservas", ancho: "angosto", vacio: "Nadie llega hoy",
    items: filas.map((r) => ({
      cuando: horaLima(r.inicio),
      titulo: `${r.titularNombres} ${r.titularApellidos}`.trim(),
      detalle: `${r.producto.nombre} · ${r.noches} ${r.noches === 1 ? "noche" : "noches"}${r.habitaciones > 1 ? ` · ${r.habitaciones} hab.` : ""}`,
      estado: ESTADO_LLEGADA(r),
      ruta: `/reservas/${r.pedido.id}`
    }))
  };
};

// ---------- Periodo ----------

/**
 * Noches vendidas por fecha (60 días) y lo facturado por alojamiento según la
 * fecha de llegada: reservas web confirmadas o completadas y estadías por
 * noche del mostrador (sin las de reservas web, que ya cuenta la reserva).
 */
const nochesDe60 = (ctx) => ctx.memo("hotel_noches", async () => {
  const desde = ctx.periodo.anteriorDesde, hasta = ctx.periodo.hasta;
  const [reservas, estadias] = await Promise.all([
    prisma.reservas.findMany({
      where: { tiendaId: ctx.tiendaId, tipo: "hotel", noches: { not: null }, inicio: { lt: hasta }, fin: { gt: desde }, pedido: { estado: { in: ESTADOS_VENDIDAS } } },
      select: { inicio: true, noches: true, habitaciones: true, pedido: { select: { total: true } } }
    }),
    prisma.hotel_estadias.findMany({
      where: { tiendaId: ctx.tiendaId, modalidad: "noche", pedidoId: null, estado: { not: "anulada" }, inicio: { lt: hasta }, fin: { gt: desde } },
      select: { modalidad: true, inicio: true, fin: true, salida: true, total: true }
    })
  ]);
  const fechas = rangoFechas(fechaLima(desde), ctx.periodo.hoy);
  const porNoche = new Map();
  const llegada = { actual: { monto: 0, noches: 0 }, anterior: { monto: 0, noches: 0 } };
  const primerDia = ctx.periodo.fechas[0];
  const sumarLlegada = (inicio, monto, noches) => {
    const p = fechaLima(inicio) >= primerDia ? llegada.actual : llegada.anterior;
    p.monto += monto;
    p.noches += noches;
  };
  for (const r of reservas) {
    const unidades = unidadesDe(r);
    for (const f of nochesDe(fechaLima(r.inicio), r.noches)) porNoche.set(f, (porNoche.get(f) ?? 0) + unidades);
    sumarLlegada(r.inicio, Number(r.pedido.total), r.noches * unidades);
  }
  for (const e of estadias) {
    const real = { ...e, fin: e.salida ?? e.fin };
    const noches = fechas.filter((f) => ocupaNoche(real, f));
    for (const f of noches) porNoche.set(f, (porNoche.get(f) ?? 0) + 1);
    sumarLlegada(e.inicio, Number(e.total), noches.length);
  }
  return { porNoche, llegada };
});

const nochesDelPeriodo = (ctx, porNoche) => {
  const primerDia = ctx.periodo.fechas[0];
  let valor = 0, anterior = 0;
  for (const [f, n] of porNoche) {
    if (f > ctx.periodo.hoy) continue;
    if (f >= primerDia) valor += n; else anterior += n;
  }
  return { valor, anterior };
};

export const nochesVendidas = async (ctx) => {
  const { valor, anterior } = nochesDelPeriodo(ctx, (await nochesDe60(ctx)).porNoche);
  return kpi("noches", "Noches vendidas", valor, "num", { anterior });
};

export const ocupacionPromedio = async (ctx) => {
  const { total } = await inventario(ctx);
  if (!total) return null;
  const { valor, anterior } = nochesDelPeriodo(ctx, (await nochesDe60(ctx)).porNoche);
  const capacidad = total * ctx.periodo.dias;
  return kpi("ocupacion", "Ocupación promedio", pct(valor, capacidad), "pct", { anterior: pct(anterior, capacidad) });
};

export const tarifaPromedio = async (ctx) => {
  const { llegada } = await nochesDe60(ctx);
  const adr = (p) => (p.noches > 0 ? redondear2(p.monto / p.noches) : 0);
  return kpi("tarifa_noche", "Tarifa promedio por noche", adr(llegada.actual), "PEN", { anterior: adr(llegada.anterior), detalle: "Según la fecha de llegada" });
};

// ---------- Próximo ----------

export const ocupacionProximos14 = async (ctx) => {
  const { total } = await inventario(ctx);
  if (!total) return null;
  const fechas = proximosDias(ctx.periodo, 14);
  const ocupadas = await ocupadasPorFecha(ctx, fechas[0], fechas[fechas.length - 1]);
  return {
    tipo: "barras", id: "ocupacion_14", titulo: "Ocupación · próximos 14 días", subtitulo: "Reservas que ocupan cupo sobre el inventario",
    ruta: "/tarifas", ancho: "completo", formato: "pct", max: 100,
    serie: fechas.map((f) => ({ etiqueta: etiquetaDiaSemana(f), valor: Math.min(pct(ocupadas.get(f) ?? 0, total), 100) }))
  };
};
