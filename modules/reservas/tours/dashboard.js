import { prisma } from "../../../config/prisma.js";
import { contador, kpi, pct } from "../../dashboard/widgets.js";
import { etiquetaDiaSemana, proximosDias } from "../../dashboard/periodo.js";
import { fechaLima, horaLima, instanteLima, sumarDias } from "../tiempo.js";

/**
 * Widgets de la agencia de tours (docs/specs/dashboard-por-rubro). Lo vendido se
 * cuenta por la fecha en que se reservó; las salidas, por su hora de inicio.
 */
const VENDIDAS = ["confirmada", "completada"];
const ACTIVAS = ["solicitada", "aceptada", "pago_en_revision", "confirmada"];

/** Pasajeros de una reserva: la suma del snapshot por tipo de pasajero. */
export const pasajerosDe = (r) => {
  const lista = Array.isArray(r.pasajeros) ? r.pasajeros : [];
  const n = lista.reduce((s, p) => s + (Number(p?.cantidad) || 0), 0);
  return n || (r.adultos ?? 0) + (r.ninos ?? 0) || 1;
};

export const salenSinConfirmar = contador("sale_sin_confirmar", "Salen en menos de 24 h sin confirmar", "crit", "/reservas",
  (ctx) => prisma.pedidos.count({
    where: {
      tiendaId: ctx.tiendaId, tipo: "tour", estado: { in: ["solicitada", "aceptada"] },
      reserva: { inicio: { gt: ctx.ahora, lte: new Date(ctx.ahora.getTime() + 24 * 3600 * 1000) } }
    }
  }));

/** Reservas vendidas en los 60 días, por fecha de reserva. */
const vendidasDe = (ctx) => ctx.memo("tours_vendidas", () => prisma.reservas.findMany({
  where: { tiendaId: ctx.tiendaId, tipo: "tour", pedido: { estado: { in: VENDIDAS }, fechaRegistro: { gte: ctx.periodo.anteriorDesde, lt: ctx.periodo.hasta } } },
  select: { pasajeros: true, adultos: true, ninos: true, productoId: true, producto: { select: { nombre: true } }, pedido: { select: { fechaRegistro: true, total: true } } }
}));

const enPeriodo = (ctx, r) => r.pedido.fechaRegistro >= ctx.periodo.desde;

export const pasajeros = async (ctx) => {
  const filas = await vendidasDe(ctx);
  let valor = 0, anterior = 0;
  for (const r of filas) {
    if (enPeriodo(ctx, r)) valor += pasajerosDe(r); else anterior += pasajerosDe(r);
  }
  return kpi("pasajeros", "Pasajeros", valor, "num", { anterior, detalle: "En reservas confirmadas" });
};

/**
 * Solicitudes ya decididas en el periodo (por fecha de la solicitud): aceptadas
 * sobre el total. Las que vencieron sin respuesta cuentan como no aceptadas.
 */
export const tasaAceptacion = async (ctx) => {
  const decididas = (desde, hasta) => prisma.reservas.findMany({
    where: { tiendaId: ctx.tiendaId, tipo: "tour", pedido: { estado: { not: "solicitada" }, fechaRegistro: { gte: desde, lt: hasta } } },
    select: { respondidaEn: true, pedido: { select: { estado: true } } }
  });
  const tasa = (filas) => {
    const aceptadas = filas.filter((r) => r.respondidaEn && r.pedido.estado !== "rechazada").length;
    return { aceptadas, total: filas.length, pct: pct(aceptadas, filas.length) };
  };
  const [actual, previo] = await Promise.all([
    decididas(ctx.periodo.desde, ctx.periodo.hasta), decididas(ctx.periodo.anteriorDesde, ctx.periodo.desde)
  ]).then(([a, b]) => [tasa(a), tasa(b)]);
  if (!actual.total) return null;
  return kpi("aceptacion", "Tasa de aceptación", actual.pct, "pct", {
    ...(previo.total ? { anterior: previo.pct } : {}), detalle: `${actual.aceptadas} de ${actual.total} solicitudes`
  });
};

/** Mediana de horas entre la solicitud y la respuesta del negocio. */
export const tiempoRespuesta = async (ctx) => {
  const mediana = async (desde, hasta) => {
    const [fila] = await prisma.$queryRaw`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.respondida_en - p.fecha_registro)) / 3600) AS horas
      FROM reservas r JOIN pedidos p ON p.id = r.pedido_id
      WHERE r.tienda_id = ${ctx.tiendaId}::uuid AND r.tipo = 'tour' AND r.respondida_en IS NOT NULL
        AND r.respondida_en >= ${desde} AND r.respondida_en < ${hasta}`;
    return fila?.horas == null ? null : Math.round(Number(fila.horas) * 10) / 10;
  };
  const [valor, anterior] = await Promise.all([
    mediana(ctx.periodo.desde, ctx.periodo.hasta), mediana(ctx.periodo.anteriorDesde, ctx.periodo.desde)
  ]);
  if (valor == null) return null;
  // Menos es mejor: el front lo sabe por `invertido`.
  return kpi("respuesta", "Tiempo de respuesta", valor, "horas", { ...(anterior != null ? { anterior } : {}), invertido: true, detalle: "Mediana" });
};

/** Salidas de hoy y mañana, agrupadas por tour y hora. */
export const proximasSalidas = async (ctx) => {
  const hoy = ctx.periodo.hoy;
  const filas = await prisma.reservas.findMany({
    where: {
      tiendaId: ctx.tiendaId, tipo: "tour", inicio: { gte: ctx.ahora, lt: instanteLima(sumarDias(hoy, 2)) },
      pedido: { estado: { in: ACTIVAS } }
    },
    orderBy: { inicio: "asc" },
    select: { inicio: true, idioma: true, pasajeros: true, adultos: true, ninos: true, productoId: true, producto: { select: { nombre: true } }, pedido: { select: { estado: true } } }
  });
  const salidas = new Map();
  for (const r of filas) {
    const clave = `${r.productoId}|${r.inicio.toISOString()}`;
    const s = salidas.get(clave) ?? { inicio: r.inicio, nombre: r.producto.nombre, pasajeros: 0, idiomas: new Set(), sinResponder: 0, porPagar: 0 };
    s.pasajeros += pasajerosDe(r);
    if (r.idioma) s.idiomas.add(r.idioma.toUpperCase());
    if (r.pedido.estado === "solicitada") s.sinResponder++;
    else if (r.pedido.estado !== "confirmada") s.porPagar++;
    salidas.set(clave, s);
  }
  const estado = (s) => s.sinResponder ? { tono: "crit", texto: `${s.sinResponder} sin responder` }
    : s.porPagar ? { tono: "warn", texto: `${s.porPagar} por pagar` } : { tono: "ok", texto: "Confirmada" };
  return {
    tipo: "lista", id: "proximas_salidas", titulo: "Próximas salidas", subtitulo: "Hoy y mañana", ruta: "/reservas/agenda", ancho: "ancho",
    vacio: "Sin salidas hoy ni mañana",
    items: [...salidas.values()].slice(0, 8).map((s) => ({
      cuando: horaLima(s.inicio),
      titulo: s.nombre,
      detalle: [fechaLima(s.inicio) === hoy ? "Hoy" : "Mañana", `${s.pasajeros} ${s.pasajeros === 1 ? "pasajero" : "pasajeros"}`, [...s.idiomas].join(" / ")]
        .filter(Boolean).join(" · "),
      estado: estado(s)
    }))
  };
};

export const toursMasVendidos = async (ctx) => {
  const porTour = new Map();
  for (const r of await vendidasDe(ctx)) {
    if (!enPeriodo(ctx, r)) continue;
    const t = porTour.get(r.productoId) ?? { nombre: r.producto.nombre, valor: 0, monto: 0 };
    t.valor += pasajerosDe(r);
    t.monto += Number(r.pedido.total);
    porTour.set(r.productoId, t);
  }
  return {
    tipo: "ranking", id: "mas_vendidos", titulo: "Tours más vendidos", subtitulo: "Pasajeros · 30 días", ruta: "/tours", ancho: "angosto",
    unidad: "pax", items: [...porTour.values()].sort((a, b) => b.valor - a.valor).slice(0, 5)
  };
};

export const pasajerosProximos14 = async (ctx) => {
  const fechas = proximosDias(ctx.periodo, 14);
  const filas = await prisma.reservas.findMany({
    where: {
      tiendaId: ctx.tiendaId, tipo: "tour", inicio: { gte: instanteLima(fechas[0]), lt: instanteLima(sumarDias(fechas[13], 1)) },
      pedido: { estado: { in: ["aceptada", "pago_en_revision", "confirmada"] } }
    },
    select: { inicio: true, pasajeros: true, adultos: true, ninos: true }
  });
  const porDia = new Map();
  for (const r of filas) porDia.set(fechaLima(r.inicio), (porDia.get(fechaLima(r.inicio)) ?? 0) + pasajerosDe(r));
  return {
    tipo: "barras", id: "pasajeros_14", titulo: "Pasajeros · próximos 14 días", subtitulo: "Reservas aceptadas y confirmadas",
    ruta: "/reservas/agenda", ancho: "completo", formato: "num",
    serie: fechas.map((f) => ({ etiqueta: etiquetaDiaSemana(f), valor: porDia.get(f) ?? 0 }))
  };
};
