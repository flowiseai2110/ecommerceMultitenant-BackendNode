import { prisma, Prisma } from "../../../config/prisma.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { invalidateProductoDetailCache } from "../../catalogo/productos.cache.js";
import { obtenerConfig } from "../reservas.config.service.js";
import { fechaLima } from "../tiempo.js";
import { CLAVES_DIA, cruzaMedianoche, franjaDe, topeDe } from "./franja.js";

/**
 * Salones de un local de eventos (docs/specs/alquiler-locales R2): un
 * `productos` (nombre, fotos, descripción, SEO, reseñas) + su ficha 1:1 en
 * `local_salones` + turnos + paquetes. Como en tours y eventos, la ficha se
 * guarda entera en una transacción (el admin la edita en un formulario con
 * pestañas Turnos y Paquetes).
 */

const num = (v) => (v === null || v === undefined ? null : Number(v));
const usuarioDe = (user) => user?.email ?? user?.id ?? null;

/** Estados de una reserva que retienen la fecha o el aforo (R2.7). */
export const ESTADOS_EN_CURSO_LOCAL = ["solicitada", "aceptada", "pago_en_revision", "confirmada", "suspendida"];

const ORDEN = [{ orden: "asc" }, { nombre: "asc" }];

const preciosDe = (p) => (p && typeof p === "object" ? Object.fromEntries(CLAVES_DIA.filter(k => p[k] != null).map(k => [k, Number(p[k])])) : null);

const serializarTurno = (t) => ({
  id: t.id, nombre: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin,
  cruzaMedianoche: cruzaMedianoche(t.horaInicio, t.horaFin),
  diasSemana: [...t.diasSemana].sort((a, b) => a - b), precios: preciosDe(t.precios), activo: t.activo, orden: t.orden
});

const serializarPaquete = (p) => ({
  id: p.id, nombre: p.nombre, descripcion: p.descripcion, modalidad: p.modalidad, precioTipo: p.precioTipo,
  precios: preciosDe(p.precios), minPersonas: p.minPersonas, maxPersonas: p.maxPersonas, incluye: p.incluye,
  horasIncluidas: p.horasIncluidas, horaExtraPrecio: num(p.horaExtraPrecio), tiposEvento: p.tiposEvento,
  esPromocion: p.esPromocion, turnoIds: p.turnoIds, activo: p.activo, orden: p.orden
});

function serializarFicha(s) {
  return {
    productoId: s.productoId,
    metros: s.metros,
    aforoMaximo: s.aforoMaximo,
    preparacionMin: s.preparacionMin,
    porHoras: s.porHoras,
    precioHora: num(s.precioHora),
    minHoras: s.minHoras,
    horasDesde: s.horasDesde,
    horasHasta: s.horasHasta,
    servicios: s.servicios
  };
}

const minimo = (valores) => {
  const v = valores.filter(x => x != null && x > 0);
  return v.length ? Math.min(...v) : null;
};

/**
 * Precio "desde" de la tarjeta: el menor precio de un evento completo (un
 * turno solo local, un paquete fijo, un paquete por persona con su mínimo de
 * personas o el mínimo de horas).
 */
export function precioDesde(salon, turnos, paquetes) {
  const activos = paquetes.filter(p => p.activo);
  const turnosActivos = turnos.filter(t => t.activo);
  const candidatos = [];
  for (const p of activos) {
    if (p.modalidad === "solo_local") {
      const ofrecidos = p.turnoIds?.length ? turnosActivos.filter(t => p.turnoIds.includes(t.id)) : turnosActivos;
      candidatos.push(minimo(ofrecidos.flatMap(t => Object.values(preciosDe(t.precios) ?? {}))));
    } else if (p.modalidad === "paquete") {
      const base = minimo(Object.values(preciosDe(p.precios) ?? {}));
      candidatos.push(base === null ? null : p.precioTipo === "por_persona" ? base * (p.minPersonas ?? 1) : base);
    } else if (p.modalidad === "por_horas" && salon.porHoras) {
      candidatos.push(num(salon.precioHora) * (salon.minHoras ?? 1));
    }
  }
  return minimo(candidatos);
}

/** Un salón se publica si tiene al menos un paquete activo que se pueda reservar. */
export function publicable(salon, turnos, paquetes) {
  return paquetes.some(p => p.activo && (p.modalidad === "por_horas" ? salon.porHoras : turnos.some(t => t.activo)));
}

const INCLUDE_FICHA = {
  turnos: { orderBy: ORDEN },
  paquetes: { orderBy: ORDEN }
};

// ============================================
// Store
// ============================================

const SELECT_PRODUCTO_STORE = {
  id: true, nombre: true, slug: true, descripcion: true, descripcionCorta: true,
  ratingPromedio: true, ratingCantidad: true, destacado: true,
  imagenes: { select: { url: true, textoAlternativo: true, esPrincipal: true, orden: true }, orderBy: { orden: "asc" } },
  salon: { include: { turnos: { where: { activo: true }, orderBy: ORDEN }, paquetes: { where: { activo: true }, orderBy: ORDEN } } }
};

function serializarSalonStore(p, { detalle = false } = {}) {
  const s = p.salon;
  const imagenes = detalle ? p.imagenes : p.imagenes.filter(i => i.esPrincipal).concat(p.imagenes.filter(i => !i.esPrincipal)).slice(0, 1);
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcionCorta: p.descripcionCorta,
    ...(detalle ? { descripcion: p.descripcion } : {}),
    imagenes: imagenes.map(i => ({ url: i.url, alt: i.textoAlternativo ?? p.nombre })),
    rating: { promedio: p.ratingPromedio, cantidad: p.ratingCantidad },
    destacado: p.destacado,
    aforoMaximo: s.aforoMaximo,
    metros: s.metros,
    servicios: s.servicios,
    porHoras: s.porHoras,
    desde: precioDesde(s, s.turnos, s.paquetes),
    ...(detalle ? {
      ficha: { ...serializarFicha(s), productoId: undefined },
      turnos: s.turnos.map(serializarTurno),
      paquetes: s.paquetes.map(serializarPaquete)
    } : {})
  };
}

export async function listarSalonesStore(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId, activo: true, salon: { isNot: null } },
    orderBy: [{ destacado: "desc" }, { nombre: "asc" }],
    select: SELECT_PRODUCTO_STORE
  });
  return productos.filter(p => publicable(p.salon, p.salon.turnos, p.salon.paquetes)).map(p => serializarSalonStore(p));
}

export async function obtenerSalonStore(tiendaId, slug) {
  const p = await prisma.productos.findFirst({
    where: { tiendaId, slug, activo: true, salon: { isNot: null } },
    select: SELECT_PRODUCTO_STORE
  });
  if (!p || !publicable(p.salon, p.salon.turnos, p.salon.paquetes)) throw new NotFoundError("Salón", "Salón no encontrado");
  return serializarSalonStore(p, { detalle: true });
}

/**
 * Para cotizar o reservar: producto activo, ficha y TODOS los turnos y
 * paquetes (la cotización descarta los inactivos con un error claro).
 */
export async function cargarSalonParaReserva(tiendaId, productoId, client = prisma) {
  const producto = await client.productos.findFirst({
    where: { id: productoId, tiendaId, activo: true },
    select: { id: true, nombre: true, salon: { include: INCLUDE_FICHA } }
  });
  if (!producto?.salon) throw new NotFoundError("Salón", "Salón no encontrado");
  const { turnos, paquetes, ...ficha } = producto.salon;
  return {
    producto: { id: producto.id, nombre: producto.nombre },
    salon: { ...ficha, nombre: producto.nombre, precioHora: num(ficha.precioHora) },
    turnos: turnos.map(t => ({ ...t, precios: preciosDe(t.precios) })),
    paquetes: paquetes.map(p => ({ ...p, precios: preciosDe(p.precios) }))
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

/** Productos de la tienda con el estado de su ficha de salón. */
export async function listarSalonesAdmin(tiendaId) {
  const productos = await prisma.productos.findMany({
    where: { tiendaId },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true, nombre: true, slug: true, activo: true,
      imagenes: { select: { url: true, esPrincipal: true }, orderBy: { orden: "asc" }, take: 3 },
      salon: { include: INCLUDE_FICHA }
    }
  });
  return productos.map(p => ({
    productoId: p.id,
    nombre: p.nombre,
    slug: p.slug,
    activo: p.activo,
    imagenUrl: (p.imagenes.find(i => i.esPrincipal) ?? p.imagenes[0])?.url ?? null,
    configurado: Boolean(p.salon && publicable(p.salon, p.salon.turnos, p.salon.paquetes)),
    aforoMaximo: p.salon?.aforoMaximo ?? null,
    turnos: (p.salon?.turnos ?? []).map(serializarTurno),
    paquetes: (p.salon?.paquetes ?? []).length,
    desde: p.salon ? precioDesde(p.salon, p.salon.turnos, p.salon.paquetes) : null
  }));
}

/** Ficha de salón de un producto con turnos y paquetes (null si todavía no la tiene). */
export async function obtenerFichaSalonAdmin(tiendaId, productoId) {
  await productoDeTienda(tiendaId, productoId);
  const s = await prisma.local_salones.findFirst({ where: { productoId, tiendaId }, include: INCLUDE_FICHA });
  return s ? { ...serializarFicha(s), turnos: s.turnos.map(serializarTurno), paquetes: s.paquetes.map(serializarPaquete) } : null;
}

/**
 * Reservas en curso del salón que un cambio dejaría sin sentido (R2.7, CE-05):
 * el aforo nuevo es menor que sus invitados o su turno se desactiva o borra.
 */
async function afectadasPorCambio(tiendaId, productoId, { aforoMaximo, turnosQueSalen }, ahora) {
  const enCurso = await prisma.pedidos.findMany({
    where: {
      tiendaId, tipo: "local", estado: { in: ESTADOS_EN_CURSO_LOCAL },
      reserva: { productoId, fin: { gt: ahora } }
    },
    select: { id: true, numeroPedido: true, clienteNombre: true, estado: true, reserva: { select: { inicio: true, turnoId: true, invitados: true } } },
    orderBy: { fechaServicio: "asc" }
  });
  return enCurso
    .map(p => {
      const motivos = [];
      if (p.reserva.invitados > aforoMaximo) motivos.push(`${p.reserva.invitados} invitados`);
      if (p.reserva.turnoId && turnosQueSalen.has(p.reserva.turnoId)) motivos.push("usa el turno que se quita");
      return motivos.length ? {
        pedidoId: p.id, codigo: p.numeroPedido, cliente: p.clienteNombre, estado: p.estado,
        fecha: fechaLima(p.reserva.inicio), motivo: motivos.join(" · ")
      } : null;
    })
    .filter(Boolean);
}

/** Un turno de madrugada no puede pasar de la hora tope municipal (R1.2). */
function validarHoraTope(turnos, horaTope) {
  const fecha = "2026-01-01";
  const fuera = turnos.filter(t => t.activo && franjaDe(fecha, t.horaInicio, t.horaFin).fin > topeDe(fecha, horaTope));
  if (fuera.length) {
    const message = `El turno ${fuera[0].nombre} termina después de la hora tope (${horaTope}). Ajusta su hora de fin o la hora tope en la configuración.`;
    throw new ValidationError(message, { message, motivo: "HORA_TOPE_EXCEDIDA", body: { turnos: [message] } });
  }
}

/**
 * Guarda la ficha y reemplaza turnos y paquetes en una transacción. Un
 * paquete puede referirse a un turno nuevo por su índice (`turnoRefs`), porque
 * el turno todavía no tiene id. Deja el producto como servicio con
 * `precioBase` = precio "desde".
 */
export async function guardarFichaSalon(tiendaId, productoId, data, user, ahora = new Date()) {
  await productoDeTienda(tiendaId, productoId);
  const usuario = usuarioDe(user);
  const config = await obtenerConfig(tiendaId);
  validarHoraTope(data.turnos, config.horaTope);

  const actuales = await prisma.local_turnos.findMany({ where: { productoId, tiendaId }, select: { id: true, activo: true } });
  const enviados = new Map(data.turnos.filter(t => t.id).map(t => [t.id, t]));
  const turnosQueSalen = new Set(actuales.filter(t => t.activo && (!enviados.has(t.id) || !enviados.get(t.id).activo)).map(t => t.id));
  const afectadas = await afectadasPorCambio(tiendaId, productoId, { aforoMaximo: data.aforoMaximo, turnosQueSalen }, ahora);
  if (afectadas.length) {
    const message = `Hay ${afectadas.length} ${afectadas.length === 1 ? "reserva afectada" : "reservas afectadas"} por este cambio. Reprográmalas o cancélalas antes.`;
    throw new ConflictError(message, { message, motivo: "CAMBIO_CON_RESERVAS", reservas: afectadas });
  }

  const ficha = {
    metros: data.metros,
    aforoMaximo: data.aforoMaximo,
    preparacionMin: data.preparacionMin,
    porHoras: data.porHoras,
    precioHora: data.porHoras ? data.precioHora : null,
    minHoras: data.porHoras ? data.minHoras : null,
    horasDesde: data.porHoras ? data.horasDesde : null,
    horasHasta: data.porHoras ? data.horasHasta : null,
    servicios: data.servicios
  };

  await prisma.$transaction(async (tx) => {
    await tx.local_salones.upsert({
      where: { productoId },
      create: { productoId, tiendaId, ...ficha, usuarioRegistro: usuario },
      update: { ...ficha, fechaActualizacion: ahora, usuarioActualizacion: usuario }
    });

    // Turnos: los que no vienen se borran (las reservas guardan el snapshot y su turno queda en null).
    const idsTurnos = [];
    await tx.local_turnos.deleteMany({ where: { productoId, tiendaId, id: { notIn: [...enviados.keys()] } } });
    for (const [i, t] of data.turnos.entries()) {
      const valores = {
        nombre: t.nombre, horaInicio: t.horaInicio, horaFin: t.horaFin, diasSemana: [...new Set(t.diasSemana)].sort((a, b) => a - b),
        precios: t.precios, activo: t.activo, orden: t.orden ?? i
      };
      if (t.id) {
        const { count } = await tx.local_turnos.updateMany({ where: { id: t.id, productoId, tiendaId }, data: { ...valores, fechaActualizacion: ahora, usuarioActualizacion: usuario } });
        if (count === 0) throw new ValidationError("Uno de los turnos no pertenece a este salón", { message: "Uno de los turnos no pertenece a este salón" });
        idsTurnos.push(t.id);
      } else {
        const creado = await tx.local_turnos.create({ data: { ...valores, productoId, tiendaId, usuarioRegistro: usuario }, select: { id: true } });
        idsTurnos.push(creado.id);
      }
    }

    const idsPaquetes = data.paquetes.filter(p => p.id).map(p => p.id);
    await tx.local_paquetes.deleteMany({ where: { productoId, tiendaId, id: { notIn: idsPaquetes } } });
    for (const [i, p] of data.paquetes.entries()) {
      const turnoIds = [...new Set([...(p.turnoIds ?? []), ...(p.turnoRefs ?? []).map(r => idsTurnos[r])])].filter(id => idsTurnos.includes(id));
      const valores = {
        nombre: p.nombre, descripcion: p.descripcion, modalidad: p.modalidad,
        precioTipo: p.modalidad === "paquete" ? p.precioTipo : "fijo",
        precios: p.modalidad === "paquete" ? p.precios : undefined,
        minPersonas: p.minPersonas, maxPersonas: p.maxPersonas, incluye: p.incluye, horasIncluidas: p.horasIncluidas,
        horaExtraPrecio: p.horaExtraPrecio, tiposEvento: p.tiposEvento, esPromocion: p.esPromocion,
        turnoIds: p.modalidad === "por_horas" ? [] : turnoIds, activo: p.activo, orden: p.orden ?? i
      };
      if (p.id) {
        const { count } = await tx.local_paquetes.updateMany({
          where: { id: p.id, productoId, tiendaId },
          // Un paquete que deja de ser "paquete" pierde su tabla de precios.
          data: { ...valores, precios: valores.precios ?? Prisma.DbNull, fechaActualizacion: ahora, usuarioActualizacion: usuario }
        });
        if (count === 0) throw new ValidationError("Uno de los paquetes no pertenece a este salón", { message: "Uno de los paquetes no pertenece a este salón" });
      } else {
        await tx.local_paquetes.create({ data: { ...valores, productoId, tiendaId, usuarioRegistro: usuario } });
      }
    }

    const salon = await tx.local_salones.findUnique({ where: { productoId }, include: INCLUDE_FICHA });
    await tx.productos.update({
      where: { id: productoId },
      data: {
        esServicio: true, precioBase: precioDesde(salon, salon.turnos, salon.paquetes) ?? 0,
        fechaActualizacion: ahora, usuarioActualizacion: usuario
      }
    });
  });

  invalidateProductoDetailCache(productoId);
  return obtenerFichaSalonAdmin(tiendaId, productoId);
}
