import { prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { invalidateProductoDetailCache } from "../../catalogo/productos.cache.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { fechaLima, horaLima, instanteLima } from "../tiempo.js";
import { disponibles, estadoVenta, finFuncion, ventaHasta } from "./cotizar.js";

/**
 * Eventos (fase 3): un `productos` (nombre, fotos, descripción, SEO) + su ficha
 * 1:1 en `eventos` + funciones (fecha y hora) con tipos de entrada (precio y
 * cupo). El cupo es real y nunca se sobrevende: comprar y confirmar bloquean
 * las filas de los tipos (FOR UPDATE), y el CHECK vendidos <= cupo lo respalda.
 *
 * Cupo apartado = entradas de compras `pago_en_revision` o `por_pagar` con el
 * apartado vigente. Se calcula al leer (sin cron): lo vencido deja de contar.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Instante → "YYYY-MM-DDTHH:mm" de Lima (valor de un <input type="datetime-local">). */
export const aLocal = (d) => (d ? `${fechaLima(d)}T${horaLima(d)}` : null);
/** "YYYY-MM-DDTHH:mm" de Lima → instante. */
export const deLocal = (v) => (v ? instanteLima(v.slice(0, 10), v.slice(11, 16)) : null);

const ORDEN_TIPOS = [{ orden: "asc" }, { precio: "desc" }];

/**
 * Entradas apartadas por tipo (compras que esperan el pago o su verificación).
 * @param {object} client - prisma o la transacción
 * @returns {Promise<Map<string, number>>}
 */
export async function apartadasPorTipo(client, tiendaId, tipoIds, ahora = new Date()) {
  if (!tipoIds.length) return new Map();
  const filas = await client.$queryRaw`
    SELECT i.tipo_entrada_id AS id, SUM(i.cantidad)::int AS apartadas
    FROM evento_compra_items i
    JOIN pedidos p ON p.id = i.pedido_id
    JOIN reservas r ON r.pedido_id = p.id
    WHERE i.tienda_id = ${tiendaId}::uuid
      AND i.tipo_entrada_id = ANY(${tipoIds}::uuid[])
      AND (p.estado = 'pago_en_revision'
           OR (p.estado = 'por_pagar' AND r.apartado_hasta > ${ahora} AND r.inicio > ${ahora}))
    GROUP BY i.tipo_entrada_id`;
  return new Map(filas.map(f => [f.id, Number(f.apartadas)]));
}

/** Bloquea los tipos de entrada (orden fijo por id para no cruzar bloqueos entre compras). */
export async function bloquearTipos(tx, tiendaId, tipoIds) {
  if (!tipoIds.length) return;
  await tx.$queryRaw`
    SELECT id FROM evento_tipos_entrada
    WHERE tienda_id = ${tiendaId}::uuid AND id = ANY(${tipoIds}::uuid[])
    ORDER BY id FOR UPDATE`;
}

/**
 * Suma (o resta) las entradas de una compra a `vendidos`. Se llama al
 * confirmar (+1) o al cancelar una compra confirmada (−1), dentro de la
 * transacción del cambio de estado.
 */
export async function moverVendidos(tx, tiendaId, pedidoId, signo) {
  const items = await tx.evento_compra_items.findMany({ where: { pedidoId, tiendaId } });
  await bloquearTipos(tx, tiendaId, [...new Set(items.map(i => i.tipoEntradaId))]);
  for (const i of items) {
    await tx.evento_tipos_entrada.update({
      where: { id: i.tipoEntradaId },
      data: { vendidos: { [signo > 0 ? "increment" : "decrement"]: i.cantidad } }
    });
  }
}

/**
 * Dentro de la transacción de la compra: bloquea los tipos, vuelve a contar el
 * cupo con las filas bloqueadas y registra las entradas. Si otra persona se
 * llevó las últimas mientras tanto, lanza 409 AGOTADO y la compra no se crea.
 */
export async function apartarEntradas(tx, { tiendaId, pedidoId, items, confirmar = false, ahora = new Date() }) {
  const ids = [...new Set(items.map(i => i.tipoEntradaId))];
  await bloquearTipos(tx, tiendaId, ids);
  const [tipos, apartadas] = await Promise.all([
    tx.evento_tipos_entrada.findMany({ where: { id: { in: ids }, tiendaId } }),
    apartadasPorTipo(tx, tiendaId, ids, ahora)
  ]);
  const porId = new Map(tipos.map(t => [t.id, t]));
  for (const i of items) {
    const tipo = porId.get(i.tipoEntradaId);
    const quedan = tipo ? disponibles(tipo, apartadas.get(tipo.id) ?? 0) : 0;
    if (i.cantidad > quedan) {
      const message = quedan === 0
        ? `Se acaban de agotar las entradas "${i.nombre}"`
        : `Solo ${quedan === 1 ? "queda 1 entrada" : `quedan ${quedan} entradas`} "${i.nombre}"`;
      throw new ConflictError(message, { message, motivo: "AGOTADO", tipoId: i.tipoEntradaId, quedan });
    }
  }
  await tx.evento_compra_items.createMany({
    data: items.map(i => ({ tiendaId, pedidoId, tipoEntradaId: i.tipoEntradaId, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio }))
  });
  // Entrada gratuita: se confirma en el acto, sin pago que verificar.
  if (confirmar) {
    for (const i of items) {
      await tx.evento_tipos_entrada.update({ where: { id: i.tipoEntradaId }, data: { vendidos: { increment: i.cantidad } } });
    }
  }
}

// ============================================
// Store
// ============================================

const SELECT_EVENTO_STORE = (ahora) => ({
  id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true,
  ratingPromedio: true, ratingCantidad: true, destacado: true,
  imagenes: { select: { url: true, textoAlternativo: true, esPrincipal: true, orden: true }, orderBy: { orden: "asc" } },
  evento: {
    include: {
      funciones: {
        where: { activa: true, inicio: { gt: ahora } },
        orderBy: { inicio: "asc" },
        include: { tiposEntrada: { where: { activo: true }, orderBy: ORDEN_TIPOS } }
      }
    }
  }
});

/** Precio "desde": la entrada activa más barata (0 = entrada libre). */
function precioDesde(funciones) {
  const precios = funciones.flatMap(f => f.tiposEntrada.filter(t => t.activo).map(t => Number(t.precio)));
  if (!precios.length) return null;
  const min = Math.min(...precios);
  return { precio: min, etiqueta: min === 0 ? "Entrada libre" : "por entrada" };
}

function serializarFuncionStore(f, { apartadas, config, ahora }) {
  const tipos = f.tiposEntrada.map(t => {
    const estado = estadoVenta({ tipo: t, funcion: f, apartadas: apartadas.get(t.id) ?? 0, config, ahora });
    const quedan = disponibles(t, apartadas.get(t.id) ?? 0);
    return {
      id: t.id,
      nombre: t.nombre,
      descripcion: t.descripcion,
      precio: num(t.precio),
      estado,
      // Solo se dice cuántas quedan cuando son pocas (R4.2).
      quedan: estado === "ultimas" ? quedan : null,
      maximo: estado === "cerrado" || estado === "agotado" ? 0 : Math.min(quedan, config.maxEntradasPorCompra),
      ventaHasta: ventaHasta(t, f)
    };
  });
  const vendibles = tipos.filter(t => t.estado === "disponible" || t.estado === "ultimas");
  return {
    id: f.id,
    nombre: f.nombre,
    inicio: f.inicio,
    fin: finFuncion(f),
    tipos,
    estado: vendibles.length ? "disponible" : tipos.some(t => t.estado === "agotado") ? "agotado" : "cerrado"
  };
}

function serializarEventoStore(p, { apartadas, config, ahora, detalle = false }) {
  const e = p.evento;
  const imagenes = detalle ? p.imagenes : p.imagenes.filter(i => i.esPrincipal).concat(p.imagenes.filter(i => !i.esPrincipal)).slice(0, 1);
  const funciones = e.funciones.map(f => serializarFuncionStore(f, { apartadas, config, ahora }));
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcionCorta: p.descripcionCorta,
    ...(detalle ? { descripcion: p.descripcion, direccion: e.direccion, mapaUrl: e.mapaUrl, organizador: e.organizador } : {}),
    imagenes: imagenes.map(i => ({ url: i.url, alt: i.textoAlternativo ?? p.nombre })),
    destacado: p.destacado,
    lugar: e.lugar,
    edadMinima: e.edadMinima,
    proximaFuncion: funciones[0]?.inicio ?? null,
    funciones: detalle ? funciones : funciones.map(({ tipos, ...f }) => f),
    agotado: funciones.length > 0 && funciones.every(f => f.estado === "agotado"),
    desde: precioDesde(e.funciones)
  };
}

const tipoIdsDe = (productos) => productos.flatMap(p => p.evento.funciones.flatMap(f => f.tiposEntrada.map(t => t.id)));

/** Eventos con al menos una función futura, ordenados por la más próxima. */
export async function listarEventosStore(tiendaId, ahora = new Date()) {
  const [productos, config] = await Promise.all([
    prisma.productos.findMany({ where: { tiendaId, activo: true, evento: { is: { privado: false } } }, select: SELECT_EVENTO_STORE(ahora) }),
    obtenerConfig(tiendaId)
  ]);
  const conFunciones = productos.filter(p => p.evento.funciones.some(f => f.tiposEntrada.length));
  const apartadas = await apartadasPorTipo(prisma, tiendaId, tipoIdsDe(conFunciones), ahora);
  return conFunciones
    .map(p => serializarEventoStore(p, { apartadas, config, ahora }))
    .sort((a, b) => new Date(a.proximaFuncion) - new Date(b.proximaFuncion));
}

export async function obtenerEventoStore(tiendaId, slug, ahora = new Date()) {
  const [p, config] = await Promise.all([
    prisma.productos.findFirst({ where: { tiendaId, slug, activo: true, evento: { is: { privado: false } } }, select: SELECT_EVENTO_STORE(ahora) }),
    obtenerConfig(tiendaId)
  ]);
  if (!p) throw new NotFoundError("Evento", "Evento no encontrado");
  const apartadas = await apartadasPorTipo(prisma, tiendaId, tipoIdsDe([p]), ahora);
  return serializarEventoStore(p, { apartadas, config, ahora, detalle: true });
}

/** Para cotizar / comprar: el evento, la función pedida y sus tipos con lo apartado. */
export async function cargarFuncionParaCompra(tiendaId, productoId, funcionId, ahora = new Date()) {
  if (!funcionId) throw new ValidationError("Elige la función", { message: "Elige la función", motivo: "FUNCION_REQUERIDA" });
  const funcion = await prisma.evento_funciones.findFirst({
    where: { id: funcionId, productoId, tiendaId, evento: { privado: false, producto: { activo: true } } },
    include: {
      tiposEntrada: { orderBy: ORDEN_TIPOS },
      evento: { include: { producto: { select: { id: true, nombre: true } } } }
    }
  });
  if (!funcion) throw new NotFoundError("Función", "Esa función del evento no existe");
  const apartadas = await apartadasPorTipo(prisma, tiendaId, funcion.tiposEntrada.map(t => t.id), ahora);
  return { producto: funcion.evento.producto, funcion, tipos: funcion.tiposEntrada, apartadas };
}

// ============================================
// Admin
// ============================================

async function productoDeTienda(tiendaId, productoId) {
  const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true, nombre: true } });
  if (!producto) throw new NotFoundError("Producto");
  return producto;
}

/** Productos de la tienda con el estado de su ficha de evento y ventas. */
export async function listarEventosAdmin(tiendaId, ahora = new Date()) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true, nombre: true, slug: true, activo: true,
      imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
      evento: { include: { funciones: { orderBy: { inicio: "asc" }, include: { tiposEntrada: true } } } }
    }
  });
  return productos.map(p => {
    const funciones = p.evento?.funciones ?? [];
    const futuras = funciones.filter(f => f.activa && f.inicio > ahora);
    const tipos = futuras.flatMap(f => f.tiposEntrada);
    return {
      productoId: p.id,
      nombre: p.nombre,
      slug: p.slug,
      activo: p.activo,
      privado: p.evento?.privado ?? false,
      imagenUrl: (p.imagenes.find(i => i.esPrincipal) ?? p.imagenes[0])?.url ?? null,
      // Un evento privado no vende entradas: basta con una función próxima.
      configurada: p.evento?.privado ? futuras.length > 0 : futuras.some(f => f.tiposEntrada.some(t => t.activo)),
      lugar: p.evento?.lugar ?? null,
      proximaFuncion: futuras[0] ? { id: futuras[0].id, inicio: futuras[0].inicio } : null,
      funcionesFuturas: futuras.length,
      vendidas: tipos.reduce((s, t) => s + t.vendidos, 0),
      cupo: tipos.reduce((s, t) => s + t.cupo, 0)
    };
  });
}

function serializarFichaAdmin(e, apartadas) {
  return {
    productoId: e.productoId,
    lugar: e.lugar,
    direccion: e.direccion,
    mapaUrl: e.mapaUrl,
    edadMinima: e.edadMinima,
    organizador: e.organizador,
    privado: e.privado,
    funciones: e.funciones.map(f => ({
      id: f.id,
      nombre: f.nombre,
      inicio: aLocal(f.inicio),
      fin: aLocal(f.fin),
      activa: f.activa,
      transmision: f.transmision ? { id: f.transmision.id, plan: f.transmision.plan, estado: f.transmision.estado } : null,
      tipos: f.tiposEntrada.map(t => ({
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion,
        precio: num(t.precio),
        cupo: t.cupo,
        vendidos: t.vendidos,
        apartadas: apartadas.get(t.id) ?? 0,
        ventaHasta: aLocal(t.ventaHasta),
        activo: t.activo,
        orden: t.orden
      }))
    }))
  };
}

const INCLUDE_FICHA = {
  funciones: {
    orderBy: { inicio: "asc" },
    include: { tiposEntrada: { orderBy: ORDEN_TIPOS }, transmision: { select: { id: true, plan: true, estado: true } } }
  }
};

/** Ficha de evento de un producto (null si todavía no la tiene). */
export async function obtenerFichaEventoAdmin(tiendaId, productoId, ahora = new Date()) {
  await productoDeTienda(tiendaId, productoId);
  const e = await prisma.eventos.findFirst({ where: { productoId, tiendaId }, include: INCLUDE_FICHA });
  if (!e) return null;
  const apartadas = await apartadasPorTipo(prisma, tiendaId, e.funciones.flatMap(f => f.tiposEntrada.map(t => t.id)), ahora);
  return serializarFichaAdmin(e, apartadas);
}

const conflicto = (message, motivo) => new ConflictError(message, { message, motivo });

/**
 * Guarda la ficha, las funciones y sus tipos de entrada en una transacción
 * (el editor trabaja la lista entera). Lo vendido manda:
 *   - una función o un tipo con ventas no se borra: se desactiva;
 *   - el cupo no puede quedar por debajo de lo vendido más lo apartado.
 * Deja el producto como servicio y con `precioBase` = la entrada más barata.
 */
export async function guardarFichaEvento(tiendaId, productoId, data, user, ahora = new Date()) {
  await productoDeTienda(tiendaId, productoId);
  const usuario = user?.email ?? user?.id ?? null;
  const ficha = {
    lugar: data.lugar, direccion: data.direccion, mapaUrl: data.mapaUrl, edadMinima: data.edadMinima, organizador: data.organizador,
    privado: data.privado
  };

  await prisma.$transaction(async (tx) => {
    await tx.eventos.upsert({ where: { productoId }, create: { productoId, tiendaId, ...ficha }, update: ficha });

    const existentes = await tx.evento_funciones.findMany({
      where: { productoId, tiendaId },
      include: { tiposEntrada: { include: { _count: { select: { items: true } } } }, transmision: { select: { id: true } } }
    });
    const tiposExistentes = new Map(existentes.flatMap(f => f.tiposEntrada.map(t => [t.id, { ...t, funcionId: f.id }])));
    const funcionesExistentes = new Map(existentes.map(f => [f.id, f]));

    // Bloquea los tipos actuales: una compra en curso no puede colarse mientras se cambia el cupo.
    await bloquearTipos(tx, tiendaId, [...tiposExistentes.keys()]);
    const apartadas = await apartadasPorTipo(tx, tiendaId, [...tiposExistentes.keys()], ahora);

    const idsFunciones = new Set(data.funciones.filter(f => f.id).map(f => f.id));
    const idsTipos = new Set(data.funciones.flatMap(f => f.tipos.filter(t => t.id).map(t => t.id)));

    for (const id of idsFunciones) {
      if (!funcionesExistentes.has(id)) throw new ValidationError("Una de las funciones no pertenece a este evento", { message: "Una de las funciones no pertenece a este evento" });
    }
    // Borrarla se llevaría la transmisión y los enlaces de los invitados (docs/specs/transmision-eventos).
    for (const f of existentes) {
      if (!idsFunciones.has(f.id) && f.transmision) {
        throw conflicto("Una función tiene una transmisión con invitados: desactívala en lugar de borrarla", "FUNCION_CON_TRANSMISION");
      }
    }
    for (const [id, t] of tiposExistentes) {
      const seBorra = !idsTipos.has(id) || !idsFunciones.has(t.funcionId);
      if (seBorra && t._count.items > 0) {
        throw conflicto(`"${t.nombre}" ya tiene compras: desactívalo en lugar de borrarlo`, "TIPO_CON_VENTAS");
      }
    }

    // Borrar primero lo que salió de la lista (sin ventas, ya validado).
    await tx.evento_tipos_entrada.deleteMany({ where: { tiendaId, id: { in: [...tiposExistentes.keys()].filter(id => !idsTipos.has(id)) } } });
    await tx.evento_funciones.deleteMany({ where: { productoId, tiendaId, id: { notIn: [...idsFunciones] } } });

    for (const f of data.funciones) {
      const inicio = deLocal(f.inicio);
      const valoresFuncion = { nombre: f.nombre, inicio, fin: deLocal(f.fin), activa: f.activa };
      let funcionId = f.id;
      if (funcionId) {
        await tx.evento_funciones.update({ where: { id: funcionId }, data: valoresFuncion });
      } else {
        if (inicio <= ahora) throw new ValidationError("Una función nueva no puede empezar en el pasado", { message: "Una función nueva no puede empezar en el pasado" });
        funcionId = (await tx.evento_funciones.create({ data: { ...valoresFuncion, tiendaId, productoId }, select: { id: true } })).id;
      }

      for (const [i, t] of f.tipos.entries()) {
        const valores = {
          nombre: t.nombre, descripcion: t.descripcion, precio: t.precio, cupo: t.cupo,
          ventaHasta: deLocal(t.ventaHasta), activo: t.activo, orden: t.orden ?? i
        };
        if (t.id) {
          const actual = tiposExistentes.get(t.id);
          if (!actual || actual.funcionId !== funcionId) {
            throw new ValidationError("Un tipo de entrada no pertenece a esta función", { message: "Un tipo de entrada no pertenece a esta función" });
          }
          const comprometidas = actual.vendidos + (apartadas.get(t.id) ?? 0);
          if (t.cupo < comprometidas) {
            throw conflicto(`El cupo de "${t.nombre}" no puede ser menor a ${comprometidas} (vendidas o apartadas)`, "CUPO_MENOR_A_VENDIDO");
          }
          await tx.evento_tipos_entrada.update({ where: { id: t.id }, data: valores });
        } else {
          await tx.evento_tipos_entrada.create({ data: { ...valores, tiendaId, funcionId } });
        }
      }
    }

    const precios = data.funciones.flatMap(f => f.tipos.filter(t => t.activo).map(t => t.precio));
    await tx.productos.update({
      where: { id: productoId },
      data: { esServicio: true, precioBase: precios.length ? Math.min(...precios) : 0, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
  }, { maxWait: 5000, timeout: 20000 });

  invalidateProductoDetailCache(productoId);
  return obtenerFichaEventoAdmin(tiendaId, productoId, ahora);
}

/**
 * Lista de asistentes de una función (reemplaza a las entradas con QR): las
 * compras confirmadas y las que esperan verificación, para controlar el
 * ingreso por código, nombre o documento. Imprimible desde el admin.
 */
export async function asistentesFuncion(tiendaId, funcionId, ahora = new Date()) {
  const funcion = await prisma.evento_funciones.findFirst({
    where: { id: funcionId, tiendaId },
    include: {
      tiposEntrada: { orderBy: ORDEN_TIPOS },
      evento: { include: { producto: { select: { nombre: true } } } }
    }
  });
  if (!funcion) throw new NotFoundError("Función", "Función no encontrada");

  const [pedidos, apartadas] = await Promise.all([
    prisma.pedidos.findMany({
      where: { tiendaId, tipo: "evento", reserva: { funcionId }, estado: { in: ["confirmada", "completada", "pago_en_revision"] } },
      include: { reserva: true, itemsEvento: true },
      orderBy: [{ clienteNombre: "asc" }]
    }),
    apartadasPorTipo(prisma, tiendaId, funcion.tiposEntrada.map(t => t.id), ahora)
  ]);

  const asistentes = pedidos.map(p => ({
    id: p.id,
    codigo: p.numeroPedido,
    titular: `${p.reserva.titularApellidos}, ${p.reserva.titularNombres}`,
    documento: `${p.reserva.titularDocTipo} ${p.reserva.titularDocNumero}`,
    whatsapp: p.clienteWhatsapp,
    estado: p.estado,
    entradas: p.itemsEvento.map(i => ({ nombre: i.nombre, cantidad: i.cantidad })),
    total: p.itemsEvento.reduce((s, i) => s + i.cantidad, 0)
  })).sort((a, b) => a.titular.localeCompare(b.titular, "es"));

  return {
    funcion: { id: funcion.id, nombre: funcion.nombre, inicio: funcion.inicio, fin: finFuncion(funcion) },
    evento: { nombre: funcion.evento.producto.nombre, lugar: funcion.evento.lugar, direccion: funcion.evento.direccion },
    tipos: funcion.tiposEntrada.map(t => ({
      id: t.id, nombre: t.nombre, cupo: t.cupo, vendidos: t.vendidos, apartadas: apartadas.get(t.id) ?? 0
    })),
    asistentes,
    totales: {
      confirmadas: asistentes.filter(a => a.estado !== "pago_en_revision").reduce((s, a) => s + a.total, 0),
      enRevision: asistentes.filter(a => a.estado === "pago_en_revision").reduce((s, a) => s + a.total, 0)
    }
  };
}

