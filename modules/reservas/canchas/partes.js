import { SignJWT, jwtVerify } from "jose";
import config from "../../../config/index.js";
import { prisma } from "../../../config/prisma.js";
import { logger } from "../../../config/logger.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import PasarelaService from "../../pagos/pasarela/pasarela.service.js";
import { registrarDestino } from "../../pagos/pasarela/destinos.js";
import { exigirAutomatico } from "../../pagos/modo-pago.service.js";
import { aplicarAccion, correoCliente, efectivoDe, obtenerSeguimiento, pedidoDeReserva } from "../reservas.service.js";
import { urlTienda } from "../../resenas/resenas.service.js";
import { confirmadaEmail } from "../reservas.emails.js";
import { transicionar } from "../estados.js";

/**
 * Pago dividido de una cancha (docs/specs/plantillas-por-rubro E7): quien reservó
 * divide el total entre N jugadores y cada uno paga su parte con su propio link
 * (pasarela). La reserva se confirma cuando lo pagado cubre lo que había que
 * pagar al separar (adelanto o total); el resto se sigue pagando por link o en la cancha.
 * Solo con pago automático: sin pasarela no hay a quién cobrarle por link.
 */

const pasarela = new PasarelaService();
const AUDIENCE = "reserva-parte";
const MAX_PARTES = 22;
const redondear = (n) => Math.round(n * 100) / 100;
const conflicto = (motivo, message) => new ConflictError(message, { message, motivo });

const secretKey = () => {
  if (!config.reservas.linkSecret) throw new Error("RESERVAS_LINK_SECRET no está configurado");
  return new TextEncoder().encode(config.reservas.linkSecret);
};

/** Link de una parte: da acceso solo a pagar esa parte, no a la reserva. */
export async function firmarTokenParte({ parteId, tiendaId }) {
  return new SignJWT({ tid: tiendaId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(parteId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.reservas.linkTtlDias}d`)
    .sign(secretKey());
}

export async function verificarTokenParte(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || !payload.tid) throw new Error("payload incompleto");
    return { parteId: payload.sub, tiendaId: payload.tid };
  } catch {
    throw new NotFoundError("Pago", "Link de pago no encontrado");
  }
}

/** Reparte un monto en N partes iguales al céntimo; la última absorbe el redondeo. */
export function repartir(total, n) {
  const centimos = Math.round(total * 100);
  const base = Math.floor(centimos / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? centimos - base * (n - 1) : base) / 100);
}

async function partesConLink(tiendaId, pedidoId, slug) {
  const partes = await prisma.reserva_partes.findMany({ where: { pedidoId }, orderBy: { numero: "asc" } });
  return Promise.all(partes.map(async p => ({
    id: p.id, numero: p.numero, monto: Number(p.monto), estado: p.estado, pagadaEn: p.pagadaEn,
    url: urlTienda(slug, `pago-parte/${await firmarTokenParte({ parteId: p.id, tiendaId })}`)
  })));
}

/** Partes de una reserva para su seguimiento (el organizador comparte los links). */
export async function partesDeReserva(tiendaId, pedidoId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  return partesConLink(tiendaId, pedidoId, tienda?.slug ?? "");
}

/**
 * Store, con el token de seguimiento: divide el total de la cancha en N partes.
 * Se puede rehacer mientras nadie haya pagado.
 */
export async function dividirPago(tiendaId, pedidoId, partes, ahora = new Date()) {
  await exigirAutomatico(tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, pedidoId);
  if (pedido.tipo !== "cancha") throw conflicto("SOLO_CANCHAS", "Solo las reservas de cancha se pueden dividir");
  transicionar(efectivoDe(pedido, ahora), "pago_pasarela", pedido.tipo);
  const n = Number(partes);
  if (!Number.isInteger(n) || n < 2 || n > MAX_PARTES) {
    const message = `Divide entre 2 y ${MAX_PARTES} jugadores`;
    throw new ValidationError(message, { message, body: { partes: [message] } });
  }
  const pagadas = await prisma.reserva_partes.count({ where: { pedidoId, estado: "pagada" } });
  if (pagadas) throw conflicto("YA_HAY_PAGOS", "Alguien ya pagó su parte: ya no se puede cambiar la división");

  const montos = repartir(Number(pedido.total), n);
  await prisma.$transaction(async (tx) => {
    await tx.reserva_partes.deleteMany({ where: { pedidoId } });
    await tx.reserva_partes.createMany({
      data: montos.map((monto, i) => ({ tiendaId, pedidoId, numero: i + 1, monto, estado: "pendiente", fechaRegistro: ahora }))
    });
    await tx.pedido_historial_estados.create({ data: { pedidoId, estado: pedido.estado, notas: `Pago dividido entre ${n} jugadores` } });
  });
  return obtenerSeguimiento(tiendaId, pedidoId, ahora);
}

async function cargarParte(parteId, tiendaId) {
  const parte = await prisma.reserva_partes.findFirst({ where: { id: parteId, tiendaId } });
  if (!parte) throw new NotFoundError("Pago", "Link de pago no encontrado");
  return parte;
}

/** Store, con el link de la parte: lo que ve el jugador antes de pagar. */
export async function obtenerParte(token, ahora = new Date()) {
  const { parteId, tiendaId } = await verificarTokenParte(token);
  const parte = await cargarParte(parteId, tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, parte.pedidoId);
  const [todas, tienda] = await Promise.all([
    prisma.reserva_partes.findMany({ where: { pedidoId: parte.pedidoId }, select: { estado: true } }),
    prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true, direccion: true } })
  ]);
  const r = pedido.reserva;
  return {
    numero: parte.numero,
    monto: Number(parte.monto),
    estado: parte.estado,
    partes: todas.length,
    pagadas: todas.filter(p => p.estado === "pagada").length,
    reserva: {
      codigo: pedido.numeroPedido,
      estado: efectivoDe(pedido, ahora),
      cancha: r.cancha?.nombre ?? r.producto?.nombre ?? null,
      inicio: r.inicio,
      fin: r.fin,
      organizador: r.titularNombres,
      negocio: tienda?.nombre ?? null,
      direccion: tienda?.direccion ?? null
    }
  };
}

/** Destino de pasarela de una parte (docs/specs/pago-automatico, destinos). */
export async function destinoParte(tiendaId, parteId, { validar = true, ahora = new Date() } = {}) {
  const parte = await cargarParte(parteId, tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, parte.pedidoId);
  if (validar) {
    if (parte.estado === "pagada") throw conflicto("PARTE_PAGADA", "Esta parte ya está pagada");
    const estado = efectivoDe(pedido, ahora);
    if (!["aceptada", "confirmada"].includes(estado)) throw conflicto("RESERVA_NO_DISPONIBLE", "Esta reserva ya no admite pagos");
  }
  return {
    tiendaId,
    pedidoId: parte.pedidoId,
    cuotaId: null,
    parteId,
    monto: Number(parte.monto),
    email: pedido.clienteEmail,
    descripcion: `Reserva ${pedido.numeroPedido} · parte ${parte.numero}`,
    alPagar: (datos) => confirmarParte(tiendaId, parteId, datos)
  };
}

/**
 * Una parte pagada: se suma a lo pagado. Si con eso se cubre lo que había que
 * pagar al separar, la reserva queda confirmada (como un pago en línea). Idempotente.
 */
async function confirmarParte(tiendaId, parteId, { pago, metodo, cargoId }, ahora = new Date()) {
  const parte = await cargarParte(parteId, tiendaId);
  const pedido = await pedidoDeReserva(tiendaId, parte.pedidoId);
  const pagado = redondear(Number(pedido.montoPagado) + Number(pago.monto));
  const estado = efectivoDe(pedido, ahora);
  const confirma = estado === "aceptada" && pagado >= Number(pedido.reserva.montoAPagar);
  const nota = `Parte ${parte.numero} pagada en línea · S/ ${Number(pago.monto).toFixed(2)} · ${metodo}`;
  const datosPedido = { montoPagado: pagado, estadoPago: pagado >= Number(pedido.total) ? "pagado" : "parcial" };

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.reserva_partes.updateMany({
      where: { id: parteId, estado: "pendiente" },
      data: { estado: "pagada", pagadaEn: ahora }
    });
    if (count === 0) return;
    if (confirma) {
      await aplicarAccion(tx, pedido, "pago_pasarela", { ahora, datosPedido: { ...datosPedido, fechaConfirmado: ahora, metodoPago: metodo, referenciaPago: cargoId }, nota });
    } else {
      const aviso = ["aceptada", "confirmada"].includes(estado) ? "" : ` · la reserva estaba ${estado}: revisar devolución`;
      if (aviso) logger.warn(`Reservas: parte ${parteId} pagada con la reserva ${pedido.numeroPedido} ${estado}`);
      await tx.pedidos.update({ where: { id: pedido.id }, data: { ...datosPedido, fechaActualizacion: ahora } });
      await tx.pedido_historial_estados.create({ data: { pedidoId: pedido.id, estado: pedido.estado, notas: nota + aviso } });
    }
  });
  if (confirma) await correoCliente(tiendaId, pedido.id, confirmadaEmail);
}

/** Store, con el link de la parte: el jugador paga su parte. */
export async function pagarParte(token, { tokenId, metodo, email = null }, ahora = new Date()) {
  const { parteId, tiendaId } = await verificarTokenParte(token);
  const { proveedor } = await exigirAutomatico(tiendaId);
  const destino = await destinoParte(tiendaId, parteId, { ahora });
  const pago = await pasarela.cobrar({ destino, tokenId, metodo, proveedor, email });
  return { pago, parte: await obtenerParte(token, ahora) };
}

// Webhook: un pago de una parte vuelve a su parte.
registrarDestino(async (pago) => (pago.parteId ? destinoParte(pago.tiendaId, pago.parteId, { validar: false }) : null));
