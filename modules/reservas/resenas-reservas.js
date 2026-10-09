import config from "../../config/index.js";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { sendTransactionalEmail } from "../../services/email.service.js";
import { firmarTokenResena } from "../resenas/resenas.token.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { pedirResenaEmail } from "./reservas.emails.js";

/**
 * "¿Cómo fue tu estadía?" (docs/specs/hospedaje-completo C6): unas horas
 * después de terminar una estadía o un tour confirmados, el huésped recibe una
 * vez el link firmado para reseñar. Así una tienda nueva junta reseñas reales.
 *
 * Idempotente: marca `resena_pedida_en` antes de enviar (updateMany con
 * resena_pedida_en null), así dos réplicas no mandan el correo dos veces.
 */

const ESPERA_HORAS = 3; // no se pide en la puerta del hotel
const VENTANA_DIAS = 7; // pasado esto ya no se pide (reservas viejas al activar la función)
const LOTE = 50;

export async function cicloResenasReservas(ahora = new Date()) {
  if (!config.resenas.linkSecret) return 0;
  const hasta = new Date(ahora.getTime() - ESPERA_HORAS * 3_600_000);
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000);
  const pendientes = await prisma.reservas.findMany({
    where: {
      tipo: { in: ["hotel", "tour"] },
      resenaPedidaEn: null,
      OR: [{ fin: { gte: desde, lte: hasta } }, { fin: null, inicio: { gte: desde, lte: hasta } }],
      pedido: { estado: { in: ["confirmada", "completada"] }, clienteEmail: { not: null } }
    },
    take: LOTE,
    select: {
      pedidoId: true, tiendaId: true, tipo: true, idiomaHuesped: true, titularNombres: true,
      producto: { select: { nombre: true } },
      pedido: { select: { clienteEmail: true, numeroPedido: true, tienda: { select: { slug: true, nombre: true, email: true } } } }
    }
  });

  // Primera reseña en otro sitio de cada negocio (Google, Tripadvisor…): el correo invita también ahí.
  const tiendas = [...new Set(pendientes.map(r => r.tiendaId))];
  const configs = tiendas.length
    ? await prisma.config_reservas.findMany({ where: { tiendaId: { in: tiendas } }, select: { tiendaId: true, resenasExternas: true } })
    : [];
  const externaDe = new Map(configs.map(c => [c.tiendaId, Array.isArray(c.resenasExternas) ? c.resenasExternas[0] ?? null : null]));

  let enviados = 0;
  for (const r of pendientes) {
    const { count } = await prisma.reservas.updateMany({ where: { pedidoId: r.pedidoId, resenaPedidaEn: null }, data: { resenaPedidaEn: ahora } });
    if (count === 0) continue; // otra réplica ya lo tomó
    try {
      const token = await firmarTokenResena({ pedidoId: r.pedidoId, tiendaId: r.tiendaId });
      const url = urlTienda(r.pedido.tienda.slug, `resenar/${token}`);
      const correo = pedirResenaEmail({
        idioma: r.idiomaHuesped, nombre: r.titularNombres, negocio: r.pedido.tienda.nombre, producto: r.producto?.nombre ?? null,
        tipo: r.tipo, externa: externaDe.get(r.tiendaId) ?? null
      }, url);
      await sendTransactionalEmail({ to: r.pedido.clienteEmail, ...correo, replyTo: r.pedido.tienda.email || undefined });
      enviados++;
    } catch (error) {
      logger.warn(`⭐ Reseñas: no se pidió la reseña de ${r.pedido.numeroPedido}: ${error.message}`);
    }
  }
  if (enviados) logger.info(`⭐ Reseñas: ${enviados} correos "¿Cómo fue tu estadía?" enviados`);
  return enviados;
}
