import { prisma } from "../../../config/prisma.js";
import { NotFoundError } from "../../../utils/errors.js";
import { invalidateProductoDetailCache } from "../../catalogo/productos.cache.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { cierresDeProducto } from "../cierres.service.js";
import { horasEntre, horaLima, instanteLima, sumarDias } from "../tiempo.js";
import { BLOQUE_MIN, bloquesDelDia, precioDesdeCancha, todoElDiaNoche } from "./tarifa.js";
import { ocupacionesVigentes, ocupar } from "./ocupaciones.js";

/**
 * Canchas de un complejo deportivo (docs/specs/alquiler-canchas R1): un
 * `productos` (nombre, fotos, descripción, reseñas) + su ficha 1:1 en
 * `cancha_canchas`. Sin ficha la cancha no se publica.
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));
const usuarioDe = (user) => user?.email ?? user?.id ?? null;

function serializarFicha(c) {
  return {
    formato: c.formato,
    largoM: c.largoM,
    anchoM: c.anchoM,
    jugadoresMax: c.jugadoresMax,
    techada: c.techada,
    superficie: c.superficie,
    precioDia: num(c.precioDia),
    precioNoche: num(c.precioNoche)
  };
}

// ============================================
// Store
// ============================================

const SELECT_PRODUCTO_STORE = {
  id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true, categoriaId: true,
  ratingPromedio: true, ratingCantidad: true, destacado: true,
  imagenes: { select: { url: true, textoAlternativo: true, esPrincipal: true, orden: true }, orderBy: { orden: "asc" } },
  cancha: true
};

function serializarCanchaStore(p, { detalle = false } = {}) {
  const imagenes = detalle ? p.imagenes : p.imagenes.filter((i) => i.esPrincipal).concat(p.imagenes.filter((i) => !i.esPrincipal)).slice(0, 1);
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    categoriaId: p.categoriaId ?? null,
    descripcionCorta: p.descripcionCorta,
    ...(detalle ? { descripcion: p.descripcion } : {}),
    imagenes: imagenes.map((i) => ({ url: i.url, alt: i.textoAlternativo ?? p.nombre })),
    rating: { promedio: p.ratingPromedio, cantidad: p.ratingCantidad },
    destacado: p.destacado,
    ...serializarFicha(p.cancha),
    desde: precioDesdeCancha(p.cancha)
  };
}

const ORDEN_STORE = [{ destacado: "desc" }, { nombre: "asc" }];

export async function listarCanchasStore(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId, activo: true, cancha: { isNot: null } },
    orderBy: ORDEN_STORE,
    select: SELECT_PRODUCTO_STORE
  });
  return productos.map((p) => serializarCanchaStore(p));
}

export async function obtenerCanchaStore(tiendaId, slug) {
  const p = await prisma.productos.findFirst({
    where: { tiendaId, slug, activo: true, cancha: { isNot: null } },
    select: SELECT_PRODUCTO_STORE
  });
  if (!p) throw new NotFoundError("Cancha", "Cancha no encontrada");
  return serializarCanchaStore(p, { detalle: true });
}

/** Para cotizar o reservar: producto activo con su ficha. */
export async function cargarCanchaParaReserva(tiendaId, productoId, client = prisma) {
  const producto = await client.productos.findFirst({
    where: { id: productoId, tiendaId, activo: true },
    select: { id: true, nombre: true, cancha: true }
  });
  if (!producto?.cancha) throw new NotFoundError("Cancha", "Cancha no encontrada");
  return { producto: { id: producto.id, nombre: producto.nombre }, cancha: { ...serializarFicha(producto.cancha), nombre: producto.nombre } };
}

/** Bloques de 30 min que toca una franja ("HH:mm" de cada uno). */
function bloquesOcupados(fecha, ocupacion, bloques) {
  const ini = new Date(ocupacion.inicio).getTime();
  const fin = new Date(ocupacion.fin).getTime();
  return bloques
    .filter((b) => {
      const t = instanteLima(fecha, b.hora).getTime();
      return t < fin && t + BLOQUE_MIN * 60 * 1000 > ini;
    })
    .map((b) => b.hora);
}

/**
 * Datos comunes de la agenda de un día: horario, bloques con su tarifa, cuáles
 * ya pasaron, fechas cerradas y ocupaciones vigentes de las canchas.
 */
async function datosDelDia(tiendaId, fecha, productoIds, ahora) {
  const config = await obtenerConfig(tiendaId);
  const bloques = bloquesDelDia(fecha, config);
  const desde = instanteLima(fecha);
  const hasta = instanteLima(sumarDias(fecha, 1));
  const [ocupaciones, cierres] = await Promise.all([
    productoIds.length ? ocupacionesVigentes(tiendaId, productoIds, desde, new Date(hasta.getTime() + 60 * 60 * 1000), { ahora }) : [],
    Promise.all(productoIds.map((id) => cierresDeProducto(tiendaId, id, fecha, fecha)))
  ]);
  // Un bloque ya pasó si empieza antes de ahora + la anticipación mínima.
  const limite = ahora.getTime() + config.anticipacionMinHoras * 60 * 60 * 1000;
  return {
    config,
    bloques: bloques.map((b) => ({ hora: b.hora, noche: b.noche, pasado: instanteLima(fecha, b.hora).getTime() <= limite })),
    ocupaciones,
    cerradas: new Set(productoIds.filter((_, i) => cierres[i].length > 0))
  };
}

/**
 * Agenda de la vitrina para un día (R3, R4): la grilla de horas de cada cancha.
 * La tienda suma los bloques para el precio y marca libre una hora si todos sus
 * bloques están libres; la reserva lo vuelve a validar al cotizar y al enviar.
 */
export async function agendaStore(tiendaId, fecha, ahora = new Date()) {
  const canchas = await prisma.cancha_canchas.findMany({
    where: { tiendaId, producto: { activo: true } },
    select: { productoId: true }
  });
  const ids = canchas.map((c) => c.productoId);
  const { config, bloques, ocupaciones, cerradas } = await datosDelDia(tiendaId, fecha, ids, ahora);
  return {
    fecha,
    todoElDiaNoche: todoElDiaNoche(fecha, config),
    bloques,
    canchas: ids.map((productoId) => ({
      productoId,
      cerrada: cerradas.has(productoId),
      ocupados: [...new Set(ocupaciones.filter((o) => o.productoId === productoId).flatMap((o) => bloquesOcupados(fecha, o, bloques)))]
    }))
  };
}

// ============================================
// Admin
// ============================================

async function productoDeTienda(tiendaId, productoId) {
  const producto = await prisma.productos.findFirst({ where: { id: productoId, tiendaId }, select: { id: true, nombre: true } });
  if (!producto) throw new NotFoundError("Producto");
  return producto;
}

/** Productos de la tienda con su ficha de cancha (o sin ella). */
export async function listarCanchasAdmin(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true, nombre: true, slug: true, activo: true,
      imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
      cancha: true
    }
  });
  return productos.map((p) => ({
    productoId: p.id,
    nombre: p.nombre,
    slug: p.slug,
    activo: p.activo,
    imagenUrl: (p.imagenes.find((i) => i.esPrincipal) ?? p.imagenes[0])?.url ?? null,
    configurado: Boolean(p.cancha),
    ficha: p.cancha ? serializarFicha(p.cancha) : null
  }));
}

/** Ficha de la cancha de un producto (null si todavía no la tiene). */
export async function obtenerFichaCanchaAdmin(tiendaId, productoId) {
  await productoDeTienda(tiendaId, productoId);
  const c = await prisma.cancha_canchas.findFirst({ where: { productoId, tiendaId } });
  return c ? serializarFicha(c) : null;
}

/**
 * Guarda la ficha y deja el producto como servicio con `precioBase` = el
 * precio "desde" (la más baja de sus dos tarifas). Cambiar precios no toca
 * las reservas hechas: cada una guarda su foto (`reservas.cancha`).
 */
export async function guardarFichaCancha(tiendaId, productoId, data, user, ahora = new Date()) {
  await productoDeTienda(tiendaId, productoId);
  const usuario = usuarioDe(user);
  const ficha = {
    formato: data.formato,
    largoM: data.largoM,
    anchoM: data.anchoM,
    jugadoresMax: data.jugadoresMax,
    techada: data.techada,
    superficie: data.superficie,
    precioDia: data.precioDia,
    precioNoche: data.precioNoche
  };
  await prisma.$transaction(async (tx) => {
    await tx.cancha_canchas.upsert({
      where: { productoId },
      create: { productoId, tiendaId, ...ficha, usuarioRegistro: usuario },
      update: { ...ficha, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
    await tx.productos.update({
      where: { id: productoId },
      data: { esServicio: true, precioBase: precioDesdeCancha(ficha), precioOferta: null, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });
  });
  invalidateProductoDetailCache(productoId);
  return obtenerFichaCanchaAdmin(tiendaId, productoId);
}

/**
 * Agenda del admin (R6): cada cancha con sus reservas y bloqueos del día, para
 * la grilla cancha × hora. Las reservas traen su código, cliente y estado.
 */
export async function agendaAdmin(tiendaId, fecha, ahora = new Date()) {
  const canchas = await prisma.productos.findMany({
    where: { tiendaId, cancha: { isNot: null } },
    orderBy: [{ activo: "desc" }, { destacado: "desc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, activo: true, cancha: { select: { formato: true } } }
  });
  const ids = canchas.map((c) => c.id);
  const { config, bloques, ocupaciones, cerradas } = await datosDelDia(tiendaId, fecha, ids, ahora);
  const pedidoIds = ocupaciones.map((o) => o.pedidoId).filter(Boolean);
  const pedidos = pedidoIds.length
    ? await prisma.pedidos.findMany({
      where: { tiendaId, id: { in: pedidoIds } },
      select: { id: true, numeroPedido: true, clienteNombre: true, clienteWhatsapp: true, estado: true }
    })
    : [];
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  return {
    fecha,
    todoElDiaNoche: todoElDiaNoche(fecha, config),
    horario: { apertura: config.canchaApertura, cierre: config.canchaCierre, inicioNoche: config.canchaInicioNoche },
    bloques,
    canchas: canchas.map((c) => ({
      productoId: c.id,
      nombre: c.nombre,
      formato: c.cancha.formato,
      activo: c.activo,
      cerrada: cerradas.has(c.id),
      ocupaciones: ocupaciones.filter((o) => o.productoId === c.id).map((o) => {
        const p = o.pedidoId ? porId.get(o.pedidoId) : null;
        return {
          id: o.id,
          tipo: o.tipo,
          desde: horaLima(new Date(o.inicio)),
          hasta: horaLima(new Date(o.fin)),
          bloques: bloquesOcupados(fecha, o, bloques),
          expiraEn: o.expiraEn,
          motivo: o.motivo,
          pedido: p ? { id: p.id, codigo: p.numeroPedido, cliente: p.clienteNombre, whatsapp: p.clienteWhatsapp, estado: p.estado } : null
        };
      })
    }))
  };
}

/** Bloqueo manual de un horario (R6): reserva por teléfono, mantenimiento, academia. */
export async function crearBloqueo(tiendaId, { productoId, fecha, horaInicio, horaFin, motivo }, user) {
  const cancha = await prisma.cancha_canchas.findFirst({ where: { tiendaId, productoId }, select: { productoId: true } });
  if (!cancha) throw new NotFoundError("Cancha", "Cancha no encontrada");
  const inicio = instanteLima(fecha, horaInicio);
  // "00:00" como fin = medianoche del día siguiente.
  const fin = horaFin === "00:00" ? instanteLima(sumarDias(fecha, 1)) : instanteLima(fecha, horaFin);
  await prisma.$transaction((tx) => ocupar(tx, {
    tiendaId, productoId, tipo: "bloqueo", inicio, fin, motivo, usuario: usuarioDe(user)
  }));
  return { productoId, fecha, horaInicio, horaFin, horas: horasEntre(inicio, fin) };
}

export async function eliminarBloqueo(tiendaId, id) {
  const { count } = await prisma.cancha_ocupaciones.updateMany({
    where: { id, tiendaId, tipo: "bloqueo", activo: true },
    data: { activo: false }
  });
  if (count === 0) throw new NotFoundError("Bloqueo", "Bloqueo no encontrado");
}
