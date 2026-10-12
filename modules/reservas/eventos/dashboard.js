import { prisma } from "../../../config/prisma.js";
import { contador, kpi, redondear2 } from "../../dashboard/widgets.js";
import { serieDelPeriodo } from "../../dashboard/periodo.js";
import { fechaLima } from "../tiempo.js";
import { apartadasPorTipo } from "./eventos.service.js";

/**
 * Widgets de eventos (docs/specs/dashboard-por-rubro). Una entrada se vende
 * cuando se verifica el pago (fecha_confirmado); lo apartado sigue la misma
 * regla que el cupo (apartadasPorTipo).
 */
const VENDIDAS = ["confirmada", "completada"];

export const apartadasSinPagar = contador("por_pagar", "Compras apartadas sin pagar", "info", "/reservas",
  (ctx) => prisma.pedidos.count({
    where: { tiendaId: ctx.tiendaId, tipo: "evento", estado: "por_pagar", reserva: { apartadoHasta: { gt: ctx.ahora }, inicio: { gt: ctx.ahora } } }
  }), { pestana: "confirmadas" });

/** Entradas vendidas por día (60 días): cantidad y monto. */
const ventasDe = (ctx) => ctx.memo("eventos_ventas", async () => {
  const items = await prisma.evento_compra_items.findMany({
    where: {
      tiendaId: ctx.tiendaId,
      pedido: { estado: { in: VENDIDAS }, fechaConfirmado: { gte: ctx.periodo.anteriorDesde, lt: ctx.periodo.hasta } }
    },
    select: { cantidad: true, precio: true, pedido: { select: { fechaConfirmado: true } } }
  });
  const cantidad = new Map(), monto = new Map();
  for (const i of items) {
    const f = fechaLima(i.pedido.fechaConfirmado);
    cantidad.set(f, (cantidad.get(f) ?? 0) + i.cantidad);
    monto.set(f, (monto.get(f) ?? 0) + i.cantidad * Number(i.precio));
  }
  return { cantidad, monto };
});

const sumar = (ctx, porFecha) => {
  const primerDia = ctx.periodo.fechas[0];
  let valor = 0, anterior = 0;
  for (const [f, v] of porFecha) { if (f >= primerDia) valor += v; else anterior += v; }
  return { valor, anterior };
};

export const entradasVendidas = async (ctx) => {
  const { valor, anterior } = sumar(ctx, (await ventasDe(ctx)).cantidad);
  return kpi("entradas", "Entradas vendidas", valor, "num", { anterior, destacado: true });
};

export const vendidasHoy = async (ctx) => {
  const { cantidad } = await ventasDe(ctx);
  const ayer = ctx.periodo.fechas[ctx.periodo.fechas.length - 2];
  return kpi("vendidas_hoy", "Vendidas hoy", cantidad.get(ctx.periodo.hoy) ?? 0, "num", { detalle: `Ayer ${cantidad.get(ayer) ?? 0}` });
};

export const ingresoPorEntrada = async (ctx) => {
  const v = await ventasDe(ctx);
  const n = sumar(ctx, v.cantidad), m = sumar(ctx, v.monto);
  const promedio = (monto, cant) => (cant > 0 ? redondear2(monto / cant) : 0);
  return kpi("por_entrada", "Ingreso por entrada", promedio(m.valor, n.valor), "PEN", { anterior: promedio(m.anterior, n.anterior) });
};

export const proximasFunciones = async (ctx) => {
  const funciones = await prisma.evento_funciones.findMany({
    where: { tiendaId: ctx.tiendaId, activa: true, inicio: { gt: ctx.ahora }, evento: { privado: false } },
    orderBy: { inicio: "asc" },
    take: 4,
    select: {
      id: true, nombre: true, inicio: true,
      evento: { select: { producto: { select: { nombre: true } } } },
      tiposEntrada: { where: { activo: true }, orderBy: { orden: "asc" }, select: { id: true, nombre: true, cupo: true, vendidos: true } }
    }
  });
  const apartadas = await apartadasPorTipo(prisma, ctx.tiendaId, funciones.flatMap((f) => f.tiposEntrada.map((t) => t.id)), ctx.ahora);
  return {
    tipo: "funciones", id: "funciones", titulo: "Próximas funciones", ruta: "/eventos", ancho: "completo", vacio: "No hay funciones programadas",
    items: funciones.map((f) => {
      const tipos = f.tiposEntrada.map((t) => ({ nombre: t.nombre, vendidas: t.vendidos, apartadas: apartadas.get(t.id) ?? 0, cupo: t.cupo }));
      const total = (k) => tipos.reduce((s, t) => s + t[k], 0);
      return {
        nombre: f.nombre ? `${f.evento.producto.nombre} · ${f.nombre}` : f.evento.producto.nombre,
        inicio: f.inicio,
        cupo: total("cupo"), vendidas: total("vendidas"), apartadas: total("apartadas"),
        tipos: tipos.map(({ apartadas: _, ...t }) => t)
      };
    })
  };
};

export const entradasPorDia = async (ctx) => ({
  tipo: "barras", id: "entradas_dia", titulo: "Entradas vendidas por día", subtitulo: "Pagos verificados", ruta: "/reservas", ancho: "completo", formato: "num",
  serie: serieDelPeriodo(ctx.periodo, (await ventasDe(ctx)).cantidad)
});
