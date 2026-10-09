import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { escapeHtml, sendTransactionalEmail } from "../../services/email.service.js";
import { urlTienda } from "../resenas/resenas.service.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { isoLima } from "./comunicados.logic.js";
import { guardarLista, leerLista } from "./comunicados.service.js";

/**
 * Fase 2 de docs/specs/comunicados (R7): avisar por email a quienes tienen una
 * reserva en las fechas afectadas. El modal solo llega a quien entra a la web;
 * esto llega a quien ya reservó (estándar en PMS hoteleros: Mews, Cloudbeds).
 *
 * Un solo envío por comunicado (`emailEnvio`), en segundo plano: Resend admite
 * pocas solicitudes por segundo y un hotel puede tener cientos de reservas.
 */

// Reservas vigentes: las terminadas, canceladas o rechazadas no se avisan.
export const ESTADOS_AVISABLES = ["solicitada", "aceptada", "por_pagar", "pago_en_revision", "confirmada"];
export const MAX_DESTINATARIOS = 500;
export const MAX_RANGO_DIAS = 180;
const PAUSA_MS = 600; // ~1,6 envíos por segundo: por debajo del límite de Resend
const DIA_MS = 86_400_000;
const e = escapeHtml;

/** "YYYY-MM-DD" (fechas civiles de Lima) → [00:00 de desde, 00:00 del día siguiente a hasta). */
export function rangoLima(desde, hasta) {
  const inicio = new Date(`${desde}T00:00:00-05:00`);
  const fin = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + DIA_MS);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) fallar("Fechas inválidas");
  if (fin <= inicio) fallar("La fecha final debe ser igual o posterior a la inicial");
  if (fin - inicio > MAX_RANGO_DIAS * DIA_MS) fallar(`El rango puede abarcar como máximo ${MAX_RANGO_DIAS} días`);
  return { inicio, fin };
}

/** Reservas que se cruzan con el rango: empiezan antes de que termine y terminan después de que empiece. */
function filtroReservas(tiendaId, { inicio, fin }) {
  return {
    tiendaId,
    inicio: { lt: fin },
    OR: [{ fin: { gt: inicio } }, { fin: null, inicio: { gte: inicio } }],
    pedido: { estado: { in: ESTADOS_AVISABLES }, clienteEmail: { not: null } }
  };
}

/** Una persona con tres reservas recibe un solo correo, con sus tres reservas. */
export function agruparPorEmail(reservas) {
  const porEmail = new Map();
  for (const r of reservas) {
    const email = r.pedido?.clienteEmail?.trim().toLowerCase();
    if (!email) continue;
    const actual = porEmail.get(email) ?? { email, nombre: r.titularNombres || r.pedido.clienteNombre || null, reservas: [] };
    actual.reservas.push({ producto: r.producto?.nombre ?? null, inicio: r.inicio, fin: r.fin, numero: r.pedido.numeroPedido });
    porEmail.set(email, actual);
  }
  return [...porEmail.values()];
}

async function buscarDestinatarios(tiendaId, rango) {
  const reservas = await prisma.reservas.findMany({
    where: filtroReservas(tiendaId, rango),
    orderBy: { inicio: "asc" },
    select: {
      inicio: true, fin: true, titularNombres: true,
      producto: { select: { nombre: true } },
      pedido: { select: { clienteEmail: true, clienteNombre: true, numeroPedido: true } }
    }
  });
  return agruparPorEmail(reservas);
}

async function buscarComunicado(tiendaId, comunicadoId) {
  const lista = await leerLista(tiendaId);
  const comunicado = lista.find((c) => c.id === comunicadoId);
  if (!comunicado) throw new NotFoundError("Comunicado");
  return { lista, comunicado };
}

/** Vista previa para el admin: a cuántos les llegaría (R7.2). */
export async function contarDestinatarios(tiendaId, comunicadoId, { desde, hasta }) {
  await buscarComunicado(tiendaId, comunicadoId);
  const destinatarios = await buscarDestinatarios(tiendaId, rangoLima(desde, hasta));
  return {
    cantidad: Math.min(destinatarios.length, MAX_DESTINATARIOS),
    total: destinatarios.length,
    limite: MAX_DESTINATARIOS
  };
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short" });

/** Link del botón: una ruta interna se vuelve absoluta en la tienda. */
export function linkAbsoluto(link, slug) {
  return link.startsWith("/") ? urlTienda(slug, link.replace(/^\/+/, "")) : link;
}

export function comunicadoEmail({ comunicado, tienda, destinatario }) {
  const parrafos = e(comunicado.mensaje)
    .split(/\n+/)
    .map((p) => `<p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #4a4a4a;">${p}</p>`)
    .join("");
  const reservas = destinatario.reservas
    .map((r) => {
      const fechas = r.fin ? `${formatoFecha.format(new Date(r.inicio))} – ${formatoFecha.format(new Date(r.fin))}` : formatoFecha.format(new Date(r.inicio));
      return `<li style="margin: 0 0 4px;">${e(r.producto ?? "Reserva")} · ${e(fechas)}${r.numero ? ` · N.º ${e(r.numero)}` : ""}</li>`;
    })
    .join("");
  const boton = comunicado.boton
    ? `<p style="margin: 20px 0 0; text-align: center;"><a href="${e(linkAbsoluto(comunicado.boton.link, tienda.slug))}" style="display: inline-block; padding: 12px 26px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">${e(comunicado.boton.texto)}</a></p>`
    : "";
  const saludo = destinatario.nombre ? `Hola, ${e(destinatario.nombre)}:` : "Hola:";

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${e(comunicado.titulo)}</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr><td align="center" style="padding: 32px 12px;">
      <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="padding: 30px 32px 10px;">
          <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">Aviso de ${e(tienda.nombre)}</p>
          <h1 style="margin: 0 0 16px; font-size: 21px; font-weight: 600; color: #1a1a1a;">${e(comunicado.titulo)}</h1>
          <p style="margin: 0 0 10px; font-size: 15px; color: #4a4a4a;">${saludo}</p>
          ${parrafos}
          ${boton}
        </td></tr>
        <tr><td style="padding: 10px 32px 26px;">
          <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">Te escribimos porque tienes ${destinatario.reservas.length === 1 ? "esta reserva" : "estas reservas"} en esas fechas:</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #1a1a1a;">${reservas}</ul>
        </td></tr>
        <tr><td style="padding: 18px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">Si tienes dudas, responde este correo y le llegará a ${e(tienda.nombre)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { subject: `${comunicado.titulo} · ${tienda.nombre}`, html };
}

/** Escribe `emailEnvio` del comunicado releyendo la lista (un PUT pudo cambiarla mientras tanto). */
async function registrarEnvio(tiendaId, comunicadoId, emailEnvio) {
  const lista = await leerLista(tiendaId);
  const nueva = lista.map((c) => (c.id === comunicadoId ? { ...c, emailEnvio } : c));
  await guardarLista(tiendaId, nueva, emailEnvio.enviadoPor);
}

/**
 * Marca el envío y responde enseguida; los correos salen en segundo plano y al
 * terminar se registran cantidad y fallidos (R7.3-R7.4).
 */
export async function iniciarEnvio(tiendaId, comunicadoId, { desde, hasta }, user, ahora = new Date()) {
  const { comunicado } = await buscarComunicado(tiendaId, comunicadoId);
  if (comunicado.emailEnvio) {
    const message = "Este comunicado ya se envió por email";
    throw new ConflictError(message, { message });
  }

  const destinatarios = (await buscarDestinatarios(tiendaId, rangoLima(desde, hasta))).slice(0, MAX_DESTINATARIOS);
  if (destinatarios.length === 0) fallar("No hay clientes con reservas en esas fechas");

  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { nombre: true, slug: true, email: true } });
  const enviadoPor = user?.email || user?.id || "system";
  const envio = { estado: "enviando", enviadoEn: isoLima(ahora), enviadoPor, desde, hasta, cantidad: destinatarios.length, fallidos: 0 };
  await registrarEnvio(tiendaId, comunicadoId, envio);

  enviarEnSegundoPlano(tiendaId, comunicado, tienda, destinatarios, envio).catch((error) =>
    logger.error(`📣 Comunicados: el envío de ${comunicadoId} se cortó: ${error.message}`)
  );
  return envio;
}

async function enviarEnSegundoPlano(tiendaId, comunicado, tienda, destinatarios, envio) {
  let fallidos = 0;
  for (const [i, destinatario] of destinatarios.entries()) {
    try {
      const correo = comunicadoEmail({ comunicado, tienda, destinatario });
      await sendTransactionalEmail({ to: destinatario.email, ...correo, replyTo: tienda.email || undefined });
    } catch (error) {
      fallidos++;
      logger.warn(`📣 Comunicados: no se envió "${comunicado.titulo}" a un cliente: ${error.message}`);
    }
    if (i < destinatarios.length - 1) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  await registrarEnvio(tiendaId, comunicado.id, { ...envio, estado: "enviado", fallidos });
  logger.info(`📣 Comunicados: "${comunicado.titulo}" enviado a ${destinatarios.length - fallidos}/${destinatarios.length} clientes`);
}

function fallar(texto) {
  throw new ValidationError(texto, { message: texto });
}
