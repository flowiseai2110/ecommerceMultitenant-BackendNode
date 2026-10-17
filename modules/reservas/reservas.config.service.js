import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { vozAlojamiento } from "./hotel/alojamiento.js";
import { HORA_CORTE_HOY } from "./hotel/cotizar.js";
import { localizar } from "../traducciones/localizar.js";
import { FUENTES } from "../traducciones/fuentes.js";
import { PLANTILLA_BASE } from "./locales/contrato.js";
import { DATOS, datosDe } from "../negocio/datos.js";
import { formularioDe } from "./formulario.js";
import { IDIOMA_BASE } from "../idiomas/idioma.js";

/**
 * Configuración de reservas de la tienda (spec R1.3). Sin fila en
 * config_reservas rigen los valores por defecto de su vertical: una tienda
 * nueva funciona sin configurar nada.
 */

/** Aviso de reserva próxima por defecto (R5.3.1, R9.6). */
/** Política de cancelación por tramos por defecto (alquiler-locales R10.2), de más a menos días. */
export const TRAMOS_POR_DEFECTO = Object.freeze([
  { desdeDias: 60, separacionPct: 0, restoPct: 100 },
  { desdeDias: 30, separacionPct: 0, restoPct: 50 },
  { desdeDias: 0, separacionPct: 0, restoPct: 0 }
]);

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
  // Recepción (docs/specs/recepcion R3.2)
  recepcionDocumento: "noche",
  vitrinaAlPaso: false,
  // Solo eventos
  apartadoManualMin: 120,
  // Pago en línea (reserva-directa-hotel RD6): el cupo se aparta mientras paga con tarjeta o Yape.
  apartadoEnLineaMin: 15,
  // Con adelanto, el cliente elige pagar el adelanto o el total (plantillas-por-rubro C8).
  cobroEleccion: false,
  // Política de cancelación del hotel (ciclo-reserva-hotel C5)
  cancelacionGratisHoras: 48,
  penalidadNoches: 1,
  maxEntradasPorCompra: 10,
  umbralUltimasEntradas: 20,
  cierrePagoManualHoras: null,
  // Solo locales (docs/specs/alquiler-locales R1.2)
  separacionTipo: "porcentaje",
  separacionMonto: null,
  respuestaHoras: 24,
  apartadoHoras: 48,
  saldoDiasAntes: 30,
  maxCuotas: 3,
  garantiaMonto: 0,
  garantiaDevolucionDias: 3,
  invitadosConfirmarDias: 7,
  reprogramacionesMax: 1,
  reprogramacionMinDias: 30,
  cargoReprogramacion: 0,
  // politicaTramos y visitasHorario (JSON) no van aquí: Prisma no acepta null
  // en un Json al crear la fila. Sin tramos rigen TRAMOS_POR_DEFECTO.
  graciaMoraDias: 3,
  saldoFavorMeses: 6,
  cotizacionVigenciaDias: 7,
  contratoPlantilla: null,
  contratoVersion: 1,
  proveedoresExternos: true,
  tarifaCoordinacion: null,
  descorcheBotella: null,
  horaTope: "03:00",
  // Solo canchas (docs/specs/alquiler-canchas R2)
  canchaApertura: "07:00",
  canchaCierre: "23:00",
  canchaInicioNoche: "18:00",
  canchaFindeNoche: true,
  canchaDuraciones: [60, 90, 120]
};

export const CAMPOS_CONFIG = [
  "modoConfirmacion", "cobro", "adelantoPct", "cobroEleccion", "cancelacionGratisHoras", "penalidadNoches", "camposFormulario", "anticipacionMinHoras", "avisoProximoHoras", "avisoProximoTexto",
  "maxSolicitudesAbiertas", "instrucciones", "politicaCancelacion", "horaCheckin", "horaCheckout", "comprobanteEn",
  "apartadoManualMin", "apartadoEnLineaMin", "maxEntradasPorCompra", "umbralUltimasEntradas", "cierrePagoManualHoras",
  "tipoAlojamiento", "ninosGratisHasta", "cargoNinoNoche", "exoneraIgvExtranjeros",
  "tipoCambioUsd", "resenasExternas", "recepcionDocumento", "vitrinaAlPaso",
  "separacionTipo", "separacionMonto", "respuestaHoras", "apartadoHoras", "saldoDiasAntes", "maxCuotas", "garantiaMonto",
  "garantiaDevolucionDias", "invitadosConfirmarDias", "reprogramacionesMax", "reprogramacionMinDias", "cargoReprogramacion",
  "politicaTramos", "graciaMoraDias", "saldoFavorMeses", "cotizacionVigenciaDias", "contratoPlantilla", "contratoVersion",
  "proveedoresExternos", "tarifaCoordinacion", "descorcheBotella", "horaTope", "visitasHorario",
  "canchaApertura", "canchaCierre", "canchaInicioNoche", "canchaFindeNoche", "canchaDuraciones"
];

/** Montos Decimal de Prisma que la lógica usa como número. */
const CAMPOS_MONTO = ["cargoNinoNoche", "tipoCambioUsd", "separacionMonto", "garantiaMonto", "cargoReprogramacion", "tarifaCoordinacion", "descorcheBotella"];

/** Defaults de una vertical, sin consultar la BD (para tests y para el seed): los de su rubro (negocio/<rubro>/datos.js). */
export function configPorDefecto(tipoNegocio) {
  return { ...BASE, ...datosDe(tipoNegocio).configReservas };
}

/**
 * Fusiona la fila guardada (si existe) con los defaults y resuelve el texto
 * del aviso: el propio del negocio o el de su vertical.
 */
export function resolverConfig(tipoNegocio, fila) {
  const config = { ...configPorDefecto(tipoNegocio) };
  if (fila) for (const campo of CAMPOS_CONFIG) if (fila[campo] !== undefined) config[campo] = fila[campo];
  for (const campo of CAMPOS_MONTO) if (config[campo] != null) config[campo] = Number(config[campo]);
  if (datosDe(tipoNegocio).planDePagos) {
    // Plan de pagos (locales): sin tramos ni plantilla propios rigen los de la plataforma.
    if (!Array.isArray(config.politicaTramos) || !config.politicaTramos.length) config.politicaTramos = TRAMOS_POR_DEFECTO.map(t => ({ ...t }));
    config.contratoPersonalizado = Boolean(config.contratoPlantilla);
    config.contratoPlantilla = config.contratoPlantilla || PLANTILLA_BASE;
  }
  config.resenasExternas = Array.isArray(config.resenasExternas) ? config.resenasExternas : [];
  // Campos del formulario con su modo: los del rubro y lo que cambió la tienda.
  config.formulario = formularioDe(tipoNegocio, config.camposFormulario);
  const v = vozAlojamiento(config.tipoAlojamiento);
  const avisoPorDefecto = (datosDe(tipoNegocio).textoAviso ?? DATOS.hotel.textoAviso)
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
export function configPublica(config, lang = IDIOMA_BASE) {
  // Instrucciones y política de cancelación en el idioma del visitante (docs/specs/idiomas D5).
  const local = localizar(FUENTES.config, config, lang);
  return {
    tipoNegocio: config.tipoNegocio,
    modoConfirmacion: config.modoConfirmacion,
    cobro: config.cobro,
    adelantoPct: config.adelantoPct,
    cobroEleccion: config.cobro === "adelanto" && !!config.cobroEleccion,
    // El huésped ve la política antes de reservar (motor de reservas, responsabilidad 3).
    cancelacionGratisHoras: config.cancelacionGratisHoras,
    penalidadNoches: config.penalidadNoches,
    formulario: config.formulario,
    anticipacionMinHoras: config.anticipacionMinHoras,
    avisoProximoHoras: config.avisoProximoHoras,
    instrucciones: local.instrucciones,
    politicaCancelacion: local.politicaCancelacion,
    horaCheckin: config.horaCheckin,
    horaCheckout: config.horaCheckout,
    // Hasta qué hora se reserva por noche para hoy (llegada tardía).
    horaCorteHoy: HORA_CORTE_HOY,
    comprobanteEn: config.comprobanteEn,
    apartadoManualMin: config.apartadoManualMin,
    apartadoEnLineaMin: config.apartadoEnLineaMin,
    maxEntradasPorCompra: config.maxEntradasPorCompra,
    cierrePagoManualHoras: config.cierrePagoManualHoras,
    tipoAlojamiento: config.tipoAlojamiento,
    // Recepción R8: hostal al paso, sin formulario de reserva.
    vitrinaAlPaso: config.vitrinaAlPaso,
    ninosGratisHasta: config.ninosGratisHasta,
    cargoNinoNoche: config.cargoNinoNoche,
    exoneraIgvExtranjeros: config.exoneraIgvExtranjeros,
    // Fase C: "≈ US$" en la vitrina y puntaje en otros sitios.
    tipoCambioUsd: config.tipoCambioUsd,
    resenasExternas: config.resenasExternas,
    // Plan de pagos (alquiler-locales R1.2): reglas que el cliente ve antes de reservar.
    ...(datosDe(config.tipoNegocio).planDePagos ? {
      separacionTipo: config.separacionTipo,
      separacionMonto: config.separacionMonto,
      saldoDiasAntes: config.saldoDiasAntes,
      maxCuotas: config.maxCuotas,
      garantiaMonto: config.garantiaMonto,
      reprogramacionesMax: config.reprogramacionesMax,
      reprogramacionMinDias: config.reprogramacionMinDias,
      cargoReprogramacion: config.cargoReprogramacion,
      politicaTramos: config.politicaTramos,
      cotizacionVigenciaDias: config.cotizacionVigenciaDias,
      proveedoresExternos: config.proveedoresExternos,
      tarifaCoordinacion: config.tarifaCoordinacion,
      descorcheBotella: config.descorcheBotella,
      horaTope: config.horaTope
    } : {}),
    // Alquiler por horas (alquiler-canchas R2): la vitrina arma la grilla de horas con esto.
    ...(datosDe(config.tipoNegocio).alquilerPorHoras ? {
      canchaApertura: config.canchaApertura,
      canchaCierre: config.canchaCierre,
      canchaInicioNoche: config.canchaInicioNoche,
      canchaFindeNoche: config.canchaFindeNoche,
      canchaDuraciones: [...config.canchaDuraciones].sort((a, b) => a - b)
    } : {})
  };
}

/** Guarda la configuración (upsert). `data` ya viene validada por Zod. */
export async function guardarConfig(tiendaId, data, user) {
  const usuario = user?.email ?? user?.id ?? null;
  const campos = Object.fromEntries(CAMPOS_CONFIG.filter(c => c in data && c !== "contratoVersion").map(c => [c, data[c]]));
  if (campos.cobro && campos.cobro !== "adelanto") campos.adelantoPct = null;
  const actual = await obtenerConfig(tiendaId);
  // Locales (R8.2): cada cambio de la plantilla sube la versión del contrato.
  if ("contratoPlantilla" in campos && (campos.contratoPlantilla || PLANTILLA_BASE) !== actual.contratoPlantilla) {
    campos.contratoVersion = (actual.contratoVersion ?? 1) + 1;
  }
  await prisma.config_reservas.upsert({
    where: { tiendaId },
    create: { ...configPorDefecto(actual.tipoNegocio), ...campos, tiendaId, usuarioRegistro: usuario },
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
