import { prisma } from "../../../config/prisma.js";
import { atencion, contador, kpi, kpis, redondear2 } from "../../dashboard/widgets.js";
import { conAnterior, serieDelPeriodo, sumarPorPeriodo } from "../../dashboard/periodo.js";
import { fechaCorta, fechaLima, horaLima } from "../../reservas/tiempo.js";

/**
 * Dashboard de la tienda de productos (docs/specs/dashboard-por-rubro).
 * Ventas = compras no canceladas por fecha del pedido (DR6: el criterio de
 * antes, pero sin reservas).
 */
const COMPRA = { tipo: "compra" };

const contarPedidos = (estado) => (ctx) => prisma.pedidos.count({ where: { tiendaId: ctx.tiendaId, ...COMPRA, estado } });

/** Productos (o variantes activas) con stock en su alerta o debajo. Los servicios no llevan stock. */
const STOCK_BAJO = (tiendaId) => prisma.$queryRaw`
  SELECT p.id, p.nombre, v.nombre AS variante, COALESCE(v.stock, p.stock) AS stock
  FROM productos p
  LEFT JOIN producto_variantes v ON v.producto_id = p.id AND v.activo
  WHERE p.tienda_id = ${tiendaId}::uuid AND p.activo AND NOT p.es_servicio
    AND (
      (v.id IS NULL AND NOT EXISTS (SELECT 1 FROM producto_variantes x WHERE x.producto_id = p.id AND x.activo) AND p.stock <= p.stock_alerta)
      OR (v.id IS NOT NULL AND v.stock <= p.stock_alerta)
    )
  ORDER BY COALESCE(v.stock, p.stock), p.nombre`;

const stockBajoDe = (ctx) => ctx.memo("stock_bajo", () => STOCK_BAJO(ctx.tiendaId));

/** Ventas y pedidos por día de los 60 días (periodo y anterior). */
const ventasDe = (ctx) => ctx.memo("ventas", async () => {
  const filas = await prisma.$queryRaw`
    SELECT to_char(fecha_registro AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS dia, SUM(total) AS monto, COUNT(*)::int AS n
    FROM pedidos
    WHERE tienda_id = ${ctx.tiendaId}::uuid AND tipo = 'compra' AND estado <> 'cancelado'
      AND fecha_registro >= ${ctx.periodo.anteriorDesde} AND fecha_registro < ${ctx.periodo.hasta}
    GROUP BY 1`;
  return {
    monto: new Map(filas.map((f) => [f.dia, Number(f.monto)])),
    n: new Map(filas.map((f) => [f.dia, f.n]))
  };
});

const ventas = async (ctx) => {
  const { valor, anterior } = sumarPorPeriodo(ctx.periodo, (await ventasDe(ctx)).monto);
  return kpi("ventas", "Ventas", redondear2(valor), "PEN", { anterior: redondear2(anterior), destacado: true });
};

const pedidos = async (ctx) => {
  const { valor, anterior } = sumarPorPeriodo(ctx.periodo, (await ventasDe(ctx)).n);
  return kpi("pedidos", "Pedidos", valor, "num", { anterior });
};

const ticketPromedio = async (ctx) => {
  const v = await ventasDe(ctx);
  const monto = sumarPorPeriodo(ctx.periodo, v.monto), n = sumarPorPeriodo(ctx.periodo, v.n);
  const promedio = (m, c) => (c > 0 ? redondear2(m / c) : 0);
  return kpi("ticket", "Ticket promedio", promedio(monto.valor, n.valor), "PEN", { anterior: promedio(monto.anterior, n.anterior) });
};

const clientesNuevos = async (ctx) => {
  const { valor, anterior } = await conAnterior(ctx.periodo, (desde, hasta) =>
    prisma.clientes.count({ where: { tiendaId: ctx.tiendaId, fechaRegistro: { gte: desde, lt: hasta } } }));
  return kpi("clientes_nuevos", "Clientes nuevos", valor, "num", { anterior });
};

const ventasPorDia = async (ctx) => ({
  tipo: "barras", id: "ventas_dia", titulo: "Ventas por día", subtitulo: "Pedidos sin cancelar", ancho: "ancho", formato: "PEN",
  serie: serieDelPeriodo(ctx.periodo, (await ventasDe(ctx)).monto)
});

const masVendidos = async (ctx) => {
  const filas = await prisma.$queryRaw`
    SELECT MAX(d.producto_nombre) AS nombre, SUM(d.cantidad)::int AS unidades, SUM(d.total) AS monto
    FROM pedido_detalles d JOIN pedidos p ON p.id = d.pedido_id
    WHERE p.tienda_id = ${ctx.tiendaId}::uuid AND p.tipo = 'compra' AND p.estado <> 'cancelado'
      AND p.fecha_registro >= ${ctx.periodo.desde}
    GROUP BY COALESCE(d.producto_id::text, d.producto_nombre)
    ORDER BY unidades DESC, nombre
    LIMIT 5`;
  return {
    tipo: "ranking", id: "mas_vendidos", titulo: "Más vendidos", subtitulo: "Unidades · 30 días", ruta: "/productos", ancho: "angosto",
    unidad: "u.", items: filas.map((f) => ({ nombre: f.nombre, valor: f.unidades, monto: Number(f.monto) }))
  };
};

/** Estados de un pedido de compra (los mismos textos que el admin). */
const ESTADO_PEDIDO = {
  pendiente: { tono: "warn", texto: "Pendiente" },
  confirmado: { tono: "info", texto: "Confirmado" },
  en_proceso: { tono: "info", texto: "En preparación" },
  enviado: { tono: "info", texto: "Enviado" },
  entregado: { tono: "ok", texto: "Entregado" },
  cancelado: { tono: "mute", texto: "Cancelado" }
};

const ultimosPedidos = async (ctx) => {
  const filas = await prisma.pedidos.findMany({
    where: { tiendaId: ctx.tiendaId, ...COMPRA },
    orderBy: { fechaRegistro: "desc" },
    take: 5,
    select: { id: true, numeroPedido: true, estado: true, total: true, fechaRegistro: true, clienteNombre: true }
  });
  const hoy = fechaLima(ctx.ahora);
  return {
    tipo: "lista", id: "ultimos_pedidos", titulo: "Últimos pedidos", ruta: "/pedidos", ancho: "ancho", vacio: "Sin pedidos todavía",
    items: filas.map((p) => {
      const dia = fechaLima(p.fechaRegistro);
      return {
        cuando: dia === hoy ? horaLima(p.fechaRegistro) : fechaCorta(dia),
        titulo: p.numeroPedido,
        detalle: p.clienteNombre ?? "Sin nombre",
        estado: ESTADO_PEDIDO[p.estado] ?? { tono: "mute", texto: p.estado },
        monto: Number(p.total),
        ruta: `/pedidos/${p.id}`
      };
    })
  };
};

const stockBajo = async (ctx) => {
  const filas = (await stockBajoDe(ctx)).slice(0, 5);
  return {
    tipo: "lista", id: "stock_bajo", titulo: "Stock bajo", subtitulo: "En su alerta de stock o debajo", ruta: "/productos", ancho: "angosto",
    vacio: "Ningún producto con stock bajo",
    items: filas.map((f) => ({
      cuando: `${f.stock} u.`,
      titulo: f.nombre,
      detalle: f.variante ?? "Sin variantes",
      estado: f.stock <= 0 ? { tono: "crit", texto: "Agotado" } : { tono: "warn", texto: "Bajo" },
      ruta: `/productos/${f.id}`
    }))
  };
};

export const dashboardProductos = Object.freeze([
  atencion([
    contador("por_confirmar", "Pedidos por confirmar", "warn", "/pedidos", contarPedidos("pendiente"), { estado: "pendiente" }),
    contador("por_despachar", "Por despachar", "info", "/pedidos", contarPedidos("en_proceso"), { estado: "en_proceso" }),
    contador("stock_bajo", "Productos con stock bajo", "crit", "/productos",
      async (ctx) => new Set((await stockBajoDe(ctx)).map((f) => f.id)).size)
  ]),
  kpis("periodo", "Últimos 30 días", [ventas, pedidos, ticketPromedio, clientesNuevos]),
  ventasPorDia,
  masVendidos,
  ultimosPedidos,
  stockBajo
]);
