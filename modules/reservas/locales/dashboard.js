import { prisma } from "../../../config/prisma.js";
import { contador, kpi, pct, redondear2 } from "../../dashboard/widgets.js";
import { fechaCorta, fechaLima, horaLima, instanteLima, sumarDias } from "../tiempo.js";
import { etiquetaTipoEvento } from "./cotizar.js";
import { etiquetaConcepto } from "./contrato.js";

/**
 * Widgets del local de eventos (docs/specs/dashboard-por-rubro): pocas ventas
 * grandes, con cotización previa y plan de pagos.
 */
const VIGENTES = ["confirmada", "pago_en_revision", "suspendida"];
const MS_HORA = 3600 * 1000;

const CANALES = {
  tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", google: "Google", portal: "Portal de eventos",
  recomendacion: "Recomendación", cartel: "Cartel o volante", otro: "Otro"
};

export const cotizacionesPorVencer = contador("cotizaciones_por_vencer", "Cotizaciones que vencen en 48 h", "info", "/cotizaciones",
  (ctx) => prisma.local_cotizaciones.count({
    where: { tiendaId: ctx.tiendaId, pedidoId: null, venceEn: { gt: ctx.ahora, lte: new Date(ctx.ahora.getTime() + 48 * MS_HORA) } }
  }));

/** Cuotas sin pagar de los eventos que siguen en pie. */
export const porCobrar = async (ctx) => {
  const cuotas = await prisma.reserva_cuotas.findMany({
    where: {
      tiendaId: ctx.tiendaId, estado: { in: ["pendiente", "en_revision"] },
      pedido: { tipo: "local", estado: { in: VIGENTES }, reserva: { fin: { gt: ctx.ahora } } }
    },
    select: { monto: true, pedidoId: true }
  });
  const eventos = new Set(cuotas.map((c) => c.pedidoId)).size;
  return kpi("por_cobrar", "Por cobrar", redondear2(cuotas.reduce((s, c) => s + Number(c.monto), 0)), "PEN",
    { detalle: `${eventos} ${eventos === 1 ? "evento" : "eventos"}` });
};

export const eventosProximos = async (ctx) => {
  const rango = { gte: ctx.ahora, lt: new Date(ctx.ahora.getTime() + 30 * 24 * MS_HORA) };
  const [confirmados, porConfirmar] = await Promise.all([
    prisma.reservas.count({ where: { tiendaId: ctx.tiendaId, tipo: "local", inicio: rango, pedido: { estado: { in: ["confirmada", "pago_en_revision"] } } } }),
    prisma.reservas.count({ where: { tiendaId: ctx.tiendaId, tipo: "local", inicio: rango, pedido: { estado: { in: ["solicitada", "aceptada"] } } } })
  ]);
  return kpi("eventos_proximos", "Eventos · próximos 30 días", confirmados, "num", porConfirmar ? { detalle: `${porConfirmar} por confirmar` } : {});
};

/**
 * Cotizaciones del periodo y en qué terminaron: con solicitud (pedido_id) y
 * confirmadas (el evento se separó). El auto-scope no cubre $queryRaw.
 */
const cotizacionesDe = (ctx) => ctx.memo("locales_cotizaciones", async () => {
  const filas = await prisma.$queryRaw`
    SELECT (c.fecha_registro >= ${ctx.periodo.desde}) AS actual,
           COUNT(*)::int AS total,
           COUNT(c.pedido_id)::int AS solicitudes,
           COUNT(*) FILTER (WHERE p.estado IN ('confirmada', 'completada', 'suspendida'))::int AS confirmadas
    FROM local_cotizaciones c LEFT JOIN pedidos p ON p.id = c.pedido_id
    WHERE c.tienda_id = ${ctx.tiendaId}::uuid AND c.fecha_registro >= ${ctx.periodo.anteriorDesde} AND c.fecha_registro < ${ctx.periodo.hasta}
    GROUP BY 1`;
  const vacio = { total: 0, solicitudes: 0, confirmadas: 0 };
  return { actual: filas.find((f) => f.actual) ?? vacio, anterior: filas.find((f) => !f.actual) ?? vacio };
});

export const conversionCotizaciones = async (ctx) => {
  const { actual, anterior } = await cotizacionesDe(ctx);
  if (!actual.total) return null;
  return kpi("conversion", "Conversión de cotizaciones", pct(actual.confirmadas, actual.total), "pct", {
    ...(anterior.total ? { anterior: pct(anterior.confirmadas, anterior.total) } : {}),
    detalle: `${actual.confirmadas} de ${actual.total}`
  });
};

export const embudo = async (ctx) => {
  const { actual } = await cotizacionesDe(ctx);
  return {
    tipo: "embudo", id: "embudo", titulo: "De cotización a evento", subtitulo: "Cotizaciones de los últimos 30 días", ruta: "/cotizaciones", ancho: "angosto",
    pasos: [
      { etiqueta: "Cotizaciones", valor: actual.total },
      { etiqueta: "Solicitudes", valor: actual.solicitudes },
      { etiqueta: "Confirmadas", valor: actual.confirmadas }
    ]
  };
};

export const canalDeOrigen = async (ctx) => {
  const filas = await prisma.local_cotizaciones.groupBy({
    by: ["canalOrigen"],
    where: { tiendaId: ctx.tiendaId, fechaRegistro: { gte: ctx.periodo.desde }, canalOrigen: { not: null } },
    _count: { _all: true }
  });
  if (!filas.length) return null;
  return {
    tipo: "ranking", id: "canal_origen", titulo: "¿De dónde llegan las cotizaciones?", subtitulo: "30 días", ancho: "completo", unidad: "cotiz.",
    items: filas.map((f) => ({ nombre: CANALES[f.canalOrigen] ?? f.canalOrigen, valor: f._count._all })).sort((a, b) => b.valor - a.valor)
  };
};

/** Eventos del mes de todos los salones (sin rechazados, vencidos ni cancelados). */
export const calendarioDelMes = async (ctx) => {
  const mes = ctx.periodo.hoy.slice(0, 7);
  const primero = `${mes}-01`;
  const siguiente = sumarDias(`${mes}-28`, 4).slice(0, 7) + "-01";
  const filas = await prisma.reservas.findMany({
    where: {
      tiendaId: ctx.tiendaId, tipo: "local", inicio: { gte: instanteLima(primero), lt: instanteLima(siguiente) },
      pedido: { estado: { in: ["solicitada", "aceptada", "pago_en_revision", "confirmada", "completada"] } }
    },
    orderBy: { inicio: "asc" },
    select: { inicio: true, tipoEvento: true, producto: { select: { nombre: true } }, turno: { select: { nombre: true } }, pedido: { select: { estado: true } } }
  });
  const dias = new Map();
  for (const r of filas) {
    const f = fechaLima(r.inicio);
    const lista = dias.get(f) ?? [];
    lista.push({
      texto: [r.producto.nombre, r.turno?.nombre ?? horaLima(r.inicio), r.tipoEvento ? etiquetaTipoEvento(r.tipoEvento) : null].filter(Boolean).join(" · "),
      estado: ["confirmada", "completada"].includes(r.pedido.estado) ? "confirmada" : "solicitada"
    });
    dias.set(f, lista);
  }
  return {
    tipo: "calendario", id: "calendario", titulo: "Calendario del mes", subtitulo: "Todos los salones", ruta: "/salones/calendario", ancho: "ancho",
    mes, hoy: ctx.periodo.hoy, dias: [...dias].map(([fecha, eventos]) => ({ fecha, eventos }))
  };
};

export const cuotasDeLaSemana = async (ctx) => {
  const cuotas = await prisma.reserva_cuotas.findMany({
    where: {
      tiendaId: ctx.tiendaId, estado: "pendiente",
      venceEn: { gte: new Date(`${ctx.periodo.hoy}T00:00:00Z`), lte: new Date(`${sumarDias(ctx.periodo.hoy, 7)}T00:00:00Z`) },
      pedido: { tipo: "local", estado: { in: VIGENTES } }
    },
    orderBy: { venceEn: "asc" },
    take: 6,
    select: { numero: true, concepto: true, monto: true, venceEn: true, pedidoId: true, pedido: { select: { clienteNombre: true, reserva: { select: { agasajado: true, tipoEvento: true } } } } }
  });
  return {
    tipo: "lista", id: "cuotas_semana", titulo: "Cuotas de esta semana", ruta: "/reservas", ancho: "angosto", vacio: "Ninguna cuota vence esta semana",
    items: cuotas.map((c) => {
      const r = c.pedido.reserva;
      const evento = r?.tipoEvento ? etiquetaTipoEvento(r.tipoEvento) + (r.agasajado ? ` de ${r.agasajado}` : "") : null;
      return {
        cuando: fechaCorta(c.venceEn.toISOString().slice(0, 10)),
        titulo: evento ?? c.pedido.clienteNombre ?? "Evento",
        detalle: `Cuota ${c.numero} · ${etiquetaConcepto(c.concepto)}`,
        monto: Number(c.monto),
        ruta: `/reservas/${c.pedidoId}`
      };
    })
  };
};
