import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { vozAlojamiento } from "./hotel/alojamiento.js";
import { textoEn } from "../traducciones/traducciones.service.js";

/**
 * Configuración de reservas de la tienda (spec R1.3). Sin fila en
 * config_reservas rigen los valores por defecto de su vertical: una tienda
 * nueva funciona sin configurar nada.
 */

/** Aviso de reserva próxima por defecto (R5.3.1, R9.6). */
export const TEXTOS_AVISO = {
  // {negocio} / {alNegocio}: el hotel, el hostal, la casa… (tipo de alojamiento, hospedaje-completo B1).
  hotel: "Tu reserva es para dentro de poco. Si {negocio} no la confirma antes de las {hora}, se anula. Te recomendamos llamar o escribir {alNegocio} por WhatsApp.",
  tours: "Tu tour sale pronto ({hora}). La agencia necesita confirmar el cupo y organizar la salida; si no la confirma antes, la solicitud se anula. Te recomendamos escribir a la agencia por WhatsApp.",
  eventos: "El organizador verifica los pagos por Yape o transferencia a mano. Si tu pago no se verifica antes de la función ({hora}), lleva tu captura: la validarán en la puerta."
};

const BASE = {
  modoConfirmacion: "solicitud",
  cobro: "total",
  adelantoPct: null,
  anticipacionMinHoras: 0,
  maxSolicitudesAbiertas: 3,
  instrucciones: null,
  politicaCancelacion: null,
  horaCheckin: "14:00",
  horaCheckout: "12:00",
  avisoProximoTexto: null,
  // Solo hotel (hospedaje-completo, fase B)
  tipoAlojamiento: "hotel",
  ninosGratisHasta: null,
  cargoNinoNoche: null,
  exoneraIgvExtranjeros: false,
  // Fase C
  tipoCambioUsd: null,
  resenasExternas: [],
  // Solo eventos
  apartadoManualMin: 120,
  maxEntradasPorCompra: 10,
  umbralUltimasEntradas: 20,
  cierrePagoManualHoras: null
};

const POR_VERTICAL = {
  // Hotel: el comprobante se emite en el check-out, junto con los consumos.
  hotel: { avisoProximoHoras: 2, comprobanteEn: "en_el_servicio" },
  tours: { avisoProximoHoras: 24, comprobanteEn: "al_pagar" },
  eventos: { avisoProximoHoras: 6, comprobanteEn: "al_pagar" },
  productos: { avisoProximoHoras: null, comprobanteEn: "al_pagar" }
};

export const CAMPOS_CONFIG = [
  "modoConfirmacion", "cobro", "adelantoPct", "anticipacionMinHoras", "avisoProximoHoras", "avisoProximoTexto",
  "maxSolicitudesAbiertas", "instrucciones", "politicaCancelacion", "horaCheckin", "horaCheckout", "comprobanteEn",
  "apartadoManualMin", "maxEntradasPorCompra", "umbralUltimasEntradas", "cierrePagoManualHoras",
  "tipoAlojamiento", "ninosGratisHasta", "cargoNinoNoche", "exoneraIgvExtranjeros",
  "tipoCambioUsd", "resenasExternas"
];

/** Defaults de una vertical, sin consultar la BD (para tests y para el seed). */
export function configPorDefecto(tipoNegocio) {
  return { ...BASE, ...(POR_VERTICAL[tipoNegocio] ?? POR_VERTICAL.productos) };
}

/**
 * Fusiona la fila guardada (si existe) con los defaults y resuelve el texto
 * del aviso: el propio del negocio o el de su vertical.
 */
export function resolverConfig(tipoNegocio, fila) {
  const config = { ...configPorDefecto(tipoNegocio) };
  if (fila) for (const campo of CAMPOS_CONFIG) if (fila[campo] !== undefined) config[campo] = fila[campo];
  if (config.cargoNinoNoche != null) config.cargoNinoNoche = Number(config.cargoNinoNoche);
  if (config.tipoCambioUsd != null) config.tipoCambioUsd = Number(config.tipoCambioUsd);
  config.resenasExternas = Array.isArray(config.resenasExternas) ? config.resenasExternas : [];
  const v = vozAlojamiento(config.tipoAlojamiento);
  const avisoPorDefecto = (TEXTOS_AVISO[tipoNegocio] ?? TEXTOS_AVISO.hotel)
    .replace("{negocio}", v.negocio).replace("{alNegocio}", v.alNegocio);
  return {
    ...config,
    tipoNegocio,
    personalizada: Boolean(fila),
    traducciones: fila?.traducciones ?? null,
    avisoTextoPorDefecto: avisoPorDefecto,
    avisoProximoTexto: config.avisoProximoTexto || avisoPorDefecto
  };
}

/**
 * @param {string} tiendaId
 * @returns {Promise<object>} configuración resuelta + datos de la tienda que usan las reservas
 */
export async function obtenerConfig(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({
    where: { id: tiendaId },
    select: { id: true, tipoNegocio: true, activo: true, configReservas: true }
  });
  if (!tienda) throw new NotFoundError("Tienda");
  return resolverConfig(tienda.tipoNegocio, tienda.configReservas);
}

/** Lo que ve el cliente en la vitrina (sin datos internos). */
export function configPublica(config, lang = "es") {
  // Inglés (C3): instrucciones y política de cancelación.
  const tr = lang === "en" ? config.traducciones?.en ?? {} : {};
  return {
    tipoNegocio: config.tipoNegocio,
    modoConfirmacion: config.modoConfirmacion,
    cobro: config.cobro,
    adelantoPct: config.adelantoPct,
    anticipacionMinHoras: config.anticipacionMinHoras,
    avisoProximoHoras: config.avisoProximoHoras,
    instrucciones: textoEn(config.instrucciones, tr.instrucciones),
    politicaCancelacion: textoEn(config.politicaCancelacion, tr.politicaCancelacion),
    horaCheckin: config.horaCheckin,
    horaCheckout: config.horaCheckout,
    comprobanteEn: config.comprobanteEn,
    apartadoManualMin: config.apartadoManualMin,
    maxEntradasPorCompra: config.maxEntradasPorCompra,
    cierrePagoManualHoras: config.cierrePagoManualHoras,
    tipoAlojamiento: config.tipoAlojamiento,
    ninosGratisHasta: config.ninosGratisHasta,
    cargoNinoNoche: config.cargoNinoNoche,
    exoneraIgvExtranjeros: config.exoneraIgvExtranjeros,
    // Fase C: "≈ US$" en la vitrina y puntaje en otros sitios.
    tipoCambioUsd: config.tipoCambioUsd,
    resenasExternas: config.resenasExternas
  };
}

/** Guarda la configuración (upsert). `data` ya viene validada por Zod. */
export async function guardarConfig(tiendaId, data, user) {
  const usuario = user?.email ?? user?.id ?? null;
  const campos = Object.fromEntries(CAMPOS_CONFIG.filter(c => c in data).map(c => [c, data[c]]));
  if (campos.cobro && campos.cobro !== "adelanto") campos.adelantoPct = null;
  await prisma.config_reservas.upsert({
    where: { tiendaId },
    create: { ...configPorDefecto((await obtenerConfig(tiendaId)).tipoNegocio), ...campos, tiendaId, usuarioRegistro: usuario },
    update: { ...campos, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
  return obtenerConfig(tiendaId);
}

/**
 * El tipo de negocio solo cambia mientras la tienda no tenga pedidos ni
 * reservas (spec R1.1): sus pedidos perderían sentido en otra vertical.
 */
export async function validarCambioTipoNegocio(tiendaId, nuevo) {
  if (!nuevo) return;
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } });
  if (!tienda || tienda.tipoNegocio === nuevo) return;
  const pedidos = await prisma.pedidos.count({ where: { tiendaId } });
  if (pedidos > 0) {
    throw new ConflictError("No se puede cambiar el tipo de negocio de una tienda que ya tiene pedidos o reservas", { message: "No se puede cambiar el tipo de negocio de una tienda que ya tiene pedidos o reservas",
      motivo: "TIPO_NEGOCIO_CON_PEDIDOS"
    });
  }
}
