import { z } from "zod";
import { documentoValido, TIPOS_DOCUMENTO } from "../libro-reclamaciones/libro.schema.js";
import { esRucValido } from "../sunat/ruc.service.js";
import { MAX_NOCHES } from "./hotel/cotizar.js";
import { TIPOS_ALOJAMIENTO } from "./hotel/alojamiento.js";
import { variablesDesconocidas } from "./locales/contrato.js";
import { MODALIDADES as MODALIDADES_LOCAL, TIPOS_EVENTO } from "./locales/cotizar.js";

/**
 * Schemas Zod del mini booking (docs/specs/mini-booking). El schema ES el
 * contrato de entrada (docs/ARQUITECTURA.md).
 */

export const PESTANAS = ["por_responder", "pago_por_verificar", "confirmadas", "historial", "cuotas_vencidas", "garantias"];
/** De dónde llegó el cliente (alquiler-locales R4.5). */
export const CANALES_ORIGEN = ["tiktok", "instagram", "facebook", "google", "portal", "recomendacion", "cartel", "otro"];
export const METODOS_PAGO_MANUAL = ["yape", "plin", "transferencia"];
export const MOTIVOS_RECHAZO = ["sin_disponibilidad", "fecha_cerrada", "otro"];
/** Sitios de reseñas externas (C6). Booking y Tripadvisor puntúan sobre 10 y 5; Google sobre 5. */
export const FUENTES_RESENA = ["google", "booking", "tripadvisor", "airbnb", "facebook", "getyourguide", "viator"];

const uuid = (campo) => z.string({ required_error: `${campo} es requerido` }).uuid(`${campo} inválido`);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

const texto = (campo, min, max) => z.string({ required_error: `${campo} es requerido` })
  .trim()
  .min(min, min > 1 ? `${campo} debe tener al menos ${min} caracteres` : `${campo} es requerido`)
  .max(max, `${campo} no puede exceder ${max} caracteres`);

const textoOpcional = (max) => z.string().trim().max(max, `No puede exceder ${max} caracteres`).nullish()
  .transform(v => v || null);

// Para actualizaciones parciales: ausente = no tocar; "" o null = borrar.
const textoParcial = (max) => z.string().trim().max(max, `No puede exceder ${max} caracteres`).nullable().optional()
  .transform(v => (v === undefined ? undefined : v || null));

const monto = z.coerce.number().min(0, "El monto no puede ser negativo").max(99999999.99);

// ============================================
// STORE
// ============================================

// Superconjunto de hotel, tours y eventos: cada vertical exige sus campos al cotizar
// (la tienda define la vertical, y el body no la trae).
const estadiaBase = {
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId"),
  fecha,
  hora: hora.nullish().transform(v => v || null),
  // Hotel
  modalidadId: uuid("modalidadId").nullish().transform(v => v || null),
  noches: z.coerce.number().int().min(1).max(MAX_NOCHES).nullish().transform(v => v ?? null),
  adultos: z.coerce.number().int().min(1, "Debe haber al menos un adulto").max(50).nullish().transform(v => v ?? null),
  ninos: z.coerce.number().int().min(0).max(50).optional().default(0),
  // Hotel (hospedaje-completo, fase B): edad de cada niño (cargo por niño),
  // extras elegidos y nacionalidad para cotizar con o sin IGV.
  edadesNinos: z.array(z.coerce.number().int().min(0, "Edad inválida").max(17, "Un niño tiene hasta 17 años")).max(50).optional().default([]),
  extras: z.array(z.object({
    extraId: uuid("extraId"),
    cantidad: z.coerce.number().int().min(1).max(20).optional().default(1),
    dato: z.string().trim().max(120).nullish().transform(v => v || null)
  })).max(10).optional().default([]),
  nacionalidad: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Nacionalidad inválida").nullish().transform(v => v || null),
  // Fase C: varias habitaciones del mismo tipo, plan de tarifa e idioma del huésped.
  habitaciones: z.coerce.number().int().min(1).max(10).optional().default(1),
  planId: uuid("planId").nullish().transform(v => v || null),
  lang: z.enum(["es", "en"]).optional(),
  // Tours
  pasajeros: z.array(z.object({
    tipoId: uuid("tipoId"),
    cantidad: z.coerce.number().int().min(0).max(200)
  })).max(10).optional().default([]),
  idioma: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "Idioma inválido").nullish().transform(v => v || null),
  // Eventos
  funcionId: uuid("funcionId").nullish().transform(v => v || null),
  entradas: z.array(z.object({
    tipoId: uuid("tipoId"),
    cantidad: z.coerce.number().int().min(0).max(50)
  })).max(20).optional().default([]),
  // Locales (alquiler-locales R4.1, R6.1). La hora de inicio del alquiler por horas va en `hora`.
  paqueteId: uuid("paqueteId").nullish().transform(v => v || null),
  turnoId: uuid("turnoId").nullish().transform(v => v || null),
  horas: z.coerce.number().int().min(1).max(24).nullish().transform(v => v ?? null),
  invitados: z.coerce.number().int().min(1, "Indica el número de invitados").max(5000).nullish().transform(v => v ?? null),
  tipoEvento: z.enum(TIPOS_EVENTO, { message: "Elige el tipo de evento" }).nullish().transform(v => v ?? null),
  agasajado: z.string().trim().max(120).nullish().transform(v => v || null),
  proveedoresExternos: z.boolean().optional().default(false),
  // Solicitud desde una cotización guardada: respeta su precio congelado (R4.2).
  cotizacionToken: z.string().min(10).max(2000).nullish().transform(v => v || null)
};

export const cotizarSchema = z.object(estadiaBase);

const personaSchema = z.object({
  nombres: texto("Nombres", 1, 100),
  apellidos: texto("Apellidos", 1, 100),
  docTipo: z.enum(TIPOS_DOCUMENTO, { message: "Tipo de documento inválido" }),
  docNumero: z.string().trim().max(20)
});

export const crearSolicitudSchema = z.object({
  ...estadiaBase,
  // Mismos datos que hoy se piden por chat (spec R5.1).
  titular: personaSchema.extend({
    nacionalidad: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Nacionalidad inválida"),
    nacimiento: fecha.nullish().transform(v => v || null)
  }),
  whatsapp: z.string({ required_error: "WhatsApp es requerido" }).trim()
    .regex(/^\+?[0-9\s-]{9,20}$/, "Número de WhatsApp inválido"),
  email: z.string({ required_error: "Correo es requerido" }).trim().toLowerCase().email("Correo inválido").max(100),
  comentarios: textoOpcional(1000),
  acompanantes: z.array(personaSchema).max(20).optional().default([]),
  // Solo hotel con comprobante en el check-out: intención de factura (R14.3).
  // Solo el RUC: razón social y dirección salen del padrón de SUNAT en el
  // servicio (datosFactura). Las otras claves se aceptan pero se ignoran.
  factura: z.object({
    ruc: z.string().trim(),
    razonSocial: z.string().max(200).nullish(),
    direccionFiscal: z.string().max(300).nullish()
  }).nullish().transform(v => v ? { ruc: v.ruc } : null),
  aceptaDatos: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar el tratamiento de tus datos para enviar la solicitud" })
  }),
  // Habitación solo para mujeres (B6): el titular lo declara; no se guarda el sexo de nadie.
  confirmaSoloMujeres: z.boolean().optional().default(false),
  // Un doble clic o un reintento con mala señal devuelve la misma reserva.
  idempotencyKey: uuid("idempotencyKey"),
  // Honeypot: una persona nunca llena este campo. Se valida en la ruta.
  sitioWeb: z.string().max(500).optional()
}).superRefine((d, ctx) => {
  const personas = [["titular", d.titular], ...d.acompanantes.map((a, i) => [`acompanantes.${i}`, a])];
  for (const [path, p] of personas) {
    if (!documentoValido(p.docTipo, p.docNumero)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path.split("."), "docNumero"],
        message: p.docTipo === "DNI" ? "El DNI debe tener 8 dígitos" : "Documento inválido (6 a 12 letras o números)"
      });
    }
  }
  if (d.factura && !esRucValido(d.factura.ruc)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["factura", "ruc"], message: "RUC inválido" });
  }
});

export const tokenParamSchema = z.object({ token: z.string().min(10).max(2000) });

export const capturaBodySchema = z.object({
  metodo: z.enum(METODOS_PAGO_MANUAL, { message: "Elige cómo pagaste" }),
  numeroOperacion: textoOpcional(40)
});

export const tiendaQuerySchema = z.object({ tiendaId: uuid("tiendaId") });

export const cierresQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  desde: fecha,
  hasta: fecha,
  productoId: uuid("productoId").optional()
});

export const slugParamSchema = z.object({ slug: z.string().trim().min(1).max(200) });

// ============================================
// ADMIN
// ============================================

export const idParamSchema = z.object({ id: uuid("id") });
export const productoParamSchema = z.object({ productoId: uuid("productoId") });

export const listarAdminQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  pestana: z.enum(PESTANAS).optional().default("por_responder"),
  productoId: uuid("productoId").optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  q: z.string().trim().max(100).optional().transform(v => v || undefined),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const agendaQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  desde: fecha.optional(),
  hasta: fecha.optional()
});

export const aceptarSchema = z.object({
  tiendaId: uuid("tiendaId"),
  // Ajuste antes de aceptar (descuento o recargo): nuevo total + motivo visible (R6.4).
  nuevoTotal: monto.nullish().transform(v => v ?? null),
  ajusteMotivo: textoOpcional(200),
  // Aceptar aunque el inventario diga que no hay cupo (hospedaje-completo C1).
  forzar: z.boolean().optional().default(false)
}).superRefine((d, ctx) => {
  if (d.nuevoTotal !== null && !d.ajusteMotivo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ajusteMotivo"], message: "Explica el ajuste al cliente" });
  }
});

export const rechazarSchema = z.object({
  tiendaId: uuid("tiendaId"),
  motivoTipo: z.enum(MOTIVOS_RECHAZO).optional().default("sin_disponibilidad"),
  motivo: textoOpcional(200)
});

export const motivoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  motivo: textoOpcional(200)
});

export const rechazarPagoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  motivo: texto("El motivo", 3, 200)
});

const listaTextos = (maxItems, maxLargo) => z.array(z.string().trim().min(1).max(maxLargo)).max(maxItems).optional().default([]);

const tipoPasajeroSchema = z.object({
  id: uuid("id").optional(),
  nombre: texto("El nombre", 1, 60),
  precio: monto,
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional()
});

export const tourSchema = z.object({
  tiendaId: uuid("tiendaId"),
  duracion: textoOpcional(50),
  duracionHoras: z.coerce.number().int().min(1).max(720).nullish().transform(v => v ?? null),
  diasSalida: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día de salida").max(7),
  horasSalida: z.array(hora).min(1, "Agrega al menos una hora de salida").max(12),
  idiomas: z.array(z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "Idioma inválido")).min(1).max(10).optional().default(["es"]),
  itinerario: z.array(z.object({
    dia: z.coerce.number().int().min(1).max(30).nullish().transform(v => v ?? null),
    hora: hora.nullish().transform(v => v || null),
    titulo: texto("El título", 1, 120),
    descripcion: textoOpcional(1000)
  })).max(40).optional().default([]),
  incluye: listaTextos(30, 200),
  noIncluye: listaTextos(30, 200),
  queLlevar: listaTextos(30, 200),
  requisitos: textoOpcional(1000),
  puntoEncuentro: textoOpcional(500),
  recojo: textoOpcional(500),
  edadMinima: z.coerce.number().int().min(0).max(99).nullish().transform(v => v ?? null),
  maxPasajeros: z.coerce.number().int().min(1).max(200).nullish().transform(v => v ?? null),
  tiposPasajero: z.array(tipoPasajeroSchema).min(1, "Agrega al menos un tipo de pasajero (por ejemplo, Adulto)").max(10)
}).superRefine((d, ctx) => {
  const nombres = d.tiposPasajero.map(t => t.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiposPasajero"], message: "Hay tipos de pasajero con el mismo nombre" });
  }
  if (!d.tiposPasajero.some(t => t.activo && t.precio > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiposPasajero"], message: "Al menos un tipo de pasajero activo debe tener precio" });
  }
});

// "YYYY-MM-DDTHH:mm" en hora de Lima (valor de un <input type="datetime-local">).
const fechaHoraLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/, "Fecha y hora inválidas")
  .transform(v => v.slice(0, 16));

const tipoEntradaSchema = z.object({
  id: uuid("id").optional(),
  nombre: texto("El nombre de la entrada", 1, 80),
  descripcion: textoOpcional(200),
  precio: monto,
  cupo: z.coerce.number().int().min(1, "El cupo debe ser al menos 1").max(100000),
  ventaHasta: fechaHoraLocal.nullish().transform(v => v || null),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional()
});

const funcionSchema = z.object({
  id: uuid("id").optional(),
  nombre: textoOpcional(80),
  inicio: fechaHoraLocal,
  fin: fechaHoraLocal.nullish().transform(v => v || null),
  activa: z.boolean().optional().default(true),
  // Mínimo 1 salvo en un evento privado (no vende entradas): lo exige eventoSchema.
  tipos: z.array(tipoEntradaSchema).max(15)
}).superRefine((f, ctx) => {
  if (f.fin && f.fin <= f.inicio) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fin"], message: "La hora de fin debe ser posterior al inicio" });
  }
  const nombres = f.tipos.map(t => t.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tipos"], message: "Hay tipos de entrada con el mismo nombre en una función" });
  }
  if (f.tipos.some(t => t.ventaHasta && t.ventaHasta > f.inicio)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tipos"], message: "La venta de una entrada no puede cerrar después del inicio de la función" });
  }
});

export const eventoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  lugar: textoOpcional(150),
  direccion: textoOpcional(500),
  mapaUrl: z.string().trim().max(500).url("Link del mapa inválido").nullish().or(z.literal("")).transform(v => v || null),
  edadMinima: z.coerce.number().int().min(0).max(99).nullish().transform(v => v ?? null),
  organizador: textoOpcional(150),
  // Evento de un cliente (cumpleaños, boda): fuera de la vitrina y sin venta de entradas.
  privado: z.boolean().optional().default(false),
  funciones: z.array(funcionSchema).min(1, "Agrega al menos una función (fecha y hora)").max(60)
}).superRefine((e, ctx) => {
  if (e.privado) return;
  e.funciones.forEach((f, i) => {
    if (!f.tipos.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["funciones", i, "tipos"], message: "Cada función necesita al menos un tipo de entrada" });
    }
  });
});

export const funcionParamSchema = z.object({ funcionId: uuid("funcionId") });

export const configSchema = z.object({
  tiendaId: uuid("tiendaId"),
  modoConfirmacion: z.enum(["solicitud", "pago_directo"]).optional(),
  cobro: z.enum(["total", "adelanto", "en_destino"]).optional(),
  adelantoPct: z.coerce.number().int().min(1).max(99).nullish(),
  anticipacionMinHoras: z.coerce.number().int().min(0).max(720).optional(),
  // null = sin aviso de reserva próxima.
  avisoProximoHoras: z.coerce.number().int().min(1).max(720).nullable().optional(),
  avisoProximoTexto: textoParcial(300),
  maxSolicitudesAbiertas: z.coerce.number().int().min(1).max(20).optional(),
  instrucciones: textoParcial(1000),
  politicaCancelacion: textoParcial(2000),
  horaCheckin: hora.optional(),
  horaCheckout: hora.optional(),
  comprobanteEn: z.enum(["al_pagar", "en_el_servicio"]).optional(),
  // Eventos
  apartadoManualMin: z.coerce.number().int().min(10).max(1440).optional(),
  maxEntradasPorCompra: z.coerce.number().int().min(1).max(50).optional(),
  umbralUltimasEntradas: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  cierrePagoManualHoras: z.coerce.number().int().min(1).max(168).nullable().optional(),
  // Hotel (hospedaje-completo, fase B)
  tipoAlojamiento: z.enum(TIPOS_ALOJAMIENTO).optional(),
  ninosGratisHasta: z.coerce.number().int().min(0).max(17).nullable().optional(),
  cargoNinoNoche: monto.nullable().optional(),
  exoneraIgvExtranjeros: z.boolean().optional(),
  // Fase C
  tipoCambioUsd: z.coerce.number().min(0.5, "Tipo de cambio inválido").max(20, "Tipo de cambio inválido").nullable().optional(),
  resenasExternas: z.array(z.object({
    fuente: z.enum(FUENTES_RESENA, { message: "Elige el sitio" }),
    puntaje: z.coerce.number().min(1).max(10),
    cantidad: z.coerce.number().int().min(1).max(1000000),
    url: z.string().trim().url("Enlace inválido").startsWith("https://", "El enlace debe empezar con https://").max(500)
  })).max(3, "Hasta 3 sitios").optional(),
  // Locales (docs/specs/alquiler-locales R1.2)
  separacionTipo: z.enum(["porcentaje", "monto_fijo"]).optional(),
  separacionMonto: monto.refine(v => v > 0, "El monto de separación debe ser mayor a 0").nullable().optional(),
  respuestaHoras: z.coerce.number().int().min(1).max(168).optional(),
  apartadoHoras: z.coerce.number().int().min(1).max(336).optional(),
  saldoDiasAntes: z.coerce.number().int().min(0).max(365).optional(),
  maxCuotas: z.coerce.number().int().min(1).max(12).optional(),
  garantiaMonto: monto.optional(),
  garantiaDevolucionDias: z.coerce.number().int().min(0).max(60).optional(),
  invitadosConfirmarDias: z.coerce.number().int().min(0).max(60).optional(),
  reprogramacionesMax: z.coerce.number().int().min(0).max(10).optional(),
  reprogramacionMinDias: z.coerce.number().int().min(0).max(365).optional(),
  cargoReprogramacion: monto.optional(),
  politicaTramos: z.array(z.object({
    desdeDias: z.coerce.number().int().min(0).max(730),
    separacionPct: z.coerce.number().int().min(0).max(100),
    restoPct: z.coerce.number().int().min(0).max(100)
  })).min(1).max(6).optional()
    .transform(v => v && [...v].sort((a, b) => b.desdeDias - a.desdeDias))
    .refine(v => !v || new Set(v.map(t => t.desdeDias)).size === v.length, "Hay dos tramos con los mismos días")
    .refine(v => !v || v.some(t => t.desdeDias === 0), "Agrega el tramo de 0 días (lo que se devuelve a última hora)"),
  graciaMoraDias: z.coerce.number().int().min(0).max(60).optional(),
  saldoFavorMeses: z.coerce.number().int().min(1).max(24).optional(),
  cotizacionVigenciaDias: z.coerce.number().int().min(1).max(60).optional(),
  // Vacío = plantilla base de la plataforma. Una variable desconocida se rechaza al guardar (R8.1).
  contratoPlantilla: textoParcial(20000).refine(v => !v || !variablesDesconocidas(v).length,
    v => ({ message: `Variables desconocidas: ${variablesDesconocidas(v ?? "").map(x => `{{${x}}}`).join(", ")}` })),
  proveedoresExternos: z.boolean().optional(),
  tarifaCoordinacion: monto.nullable().optional(),
  descorcheBotella: monto.nullable().optional(),
  horaTope: hora.optional()
}).superRefine((d, ctx) => {
  if (d.cobro === "adelanto" && !d.adelantoPct) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adelantoPct"], message: "Indica el porcentaje de adelanto" });
  }
  if (d.separacionTipo === "monto_fijo" && !d.separacionMonto) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["separacionMonto"], message: "Indica el monto de la separación" });
  }
});

export const crearCierreSchema = z.object({
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId").nullish().transform(v => v || null),
  fechaDesde: fecha,
  fechaHasta: fecha,
  motivo: textoOpcional(100)
}).refine(d => d.fechaDesde <= d.fechaHasta, { path: ["fechaHasta"], message: "La fecha final no puede ser anterior a la inicial" });

const modalidadSchema = z.object({
  id: uuid("id").optional(),
  tipo: z.enum(["noche", "horas"]),
  horas: z.coerce.number().int().min(1).max(23).nullish().transform(v => v ?? null),
  precio: monto.refine(v => v > 0, "El precio debe ser mayor a 0"),
  precioVieSab: monto.nullish().transform(v => v || null),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional().default(0)
}).superRefine((m, ctx) => {
  if (m.tipo === "horas" && !m.horas) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["horas"], message: "Indica cuántas horas dura el bloque" });
  }
});

export const habitacionSchema = z.object({
  tiendaId: uuid("tiendaId"),
  capacidadAdultos: z.coerce.number().int().min(1).max(50),
  capacidadNinos: z.coerce.number().int().min(0).max(50).optional().default(0),
  capacidadMax: z.coerce.number().int().min(1).max(50),
  porPersona: z.boolean().optional().default(false),
  soloMujeres: z.boolean().optional().default(false),
  // Inventario (C1): habitaciones de este tipo (o camas); vacío = el negocio confirma a mano.
  unidades: z.coerce.number().int().min(1).max(500).nullish().transform(v => v ?? null),
  camas: textoOpcional(100),
  amenities: z.array(z.string().trim().min(1).max(40)).max(30).optional().default([]),
  modalidades: z.array(modalidadSchema).min(1, "Agrega al menos una modalidad (noche o por horas)").max(10)
}).superRefine((d, ctx) => {
  if (d.capacidadMax < d.capacidadAdultos) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacidadMax"], message: "El máximo de personas no puede ser menor que los adultos" });
  }
  const claves = d.modalidades.map(m => `${m.tipo}:${m.tipo === "horas" ? m.horas : 0}`);
  if (new Set(claves).size !== claves.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["modalidades"], message: "Hay modalidades repetidas (misma cantidad de horas o dos de noche)" });
  }
});

// ---------- Locales: salón, turnos y paquetes (alquiler-locales R2) ----------

const precioDia = monto.refine(v => v > 0, "El precio debe ser mayor a 0");
/** Precio por día: lunes a jueves obligatorio; viernes, sábado, domingo y feriado opcionales (caen en lunes a jueves). */
const preciosDiaSchema = z.object({
  lj: precioDia,
  v: precioDia.nullish(),
  s: precioDia.nullish(),
  d: precioDia.nullish(),
  f: precioDia.nullish()
}).transform(p => Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)));

const turnoSchema = z.object({
  id: uuid("id").optional(),
  nombre: texto("El nombre del turno", 1, 60),
  horaInicio: hora,
  horaFin: hora,
  diasSemana: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día").max(7),
  precios: preciosDiaSchema,
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).max(999).optional()
}).refine(t => t.horaInicio !== t.horaFin, { path: ["horaFin"], message: "El turno no puede empezar y terminar a la misma hora" });

const paqueteSchema = z.object({
  id: uuid("id").optional(),
  nombre: texto("El nombre del paquete", 1, 80),
  descripcion: textoOpcional(300),
  modalidad: z.enum(MODALIDADES_LOCAL, { message: "Elige la modalidad" }),
  precioTipo: z.enum(["fijo", "por_persona"]).optional().default("fijo"),
  precios: preciosDiaSchema.nullish().transform(v => v ?? null),
  minPersonas: z.coerce.number().int().min(1).max(5000).nullish().transform(v => v ?? null),
  maxPersonas: z.coerce.number().int().min(1).max(5000).nullish().transform(v => v ?? null),
  incluye: listaTextos(30, 120),
  horasIncluidas: z.coerce.number().int().min(1).max(24).nullish().transform(v => v ?? null),
  horaExtraPrecio: monto.nullish().transform(v => v ?? null),
  tiposEvento: z.array(z.enum(TIPOS_EVENTO)).max(TIPOS_EVENTO.length).optional().default([]),
  esPromocion: z.boolean().optional().default(false),
  // Turnos existentes por id; los nuevos (sin id aún) por su posición en `turnos`.
  turnoIds: z.array(uuid("turnoId")).max(10).optional().default([]),
  turnoRefs: z.array(z.coerce.number().int().min(0).max(9)).max(10).optional().default([]),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).max(999).optional()
}).superRefine((p, ctx) => {
  if (p.modalidad === "paquete" && !p.precios) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["precios"], message: "Indica el precio del paquete" });
  }
  if (p.minPersonas && p.maxPersonas && p.maxPersonas < p.minPersonas) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxPersonas"], message: "El máximo no puede ser menor que el mínimo" });
  }
  if (p.esPromocion && !(p.modalidad === "paquete" && p.precioTipo === "por_persona")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["esPromocion"], message: "Solo un paquete por persona puede ser de promoción" });
  }
});

export const salonSchema = z.object({
  tiendaId: uuid("tiendaId"),
  metros: z.coerce.number().int().min(1).max(100000).nullish().transform(v => v ?? null),
  // El de la licencia de funcionamiento / ITSE (R2.2).
  aforoMaximo: z.coerce.number({ invalid_type_error: "Indica el aforo" }).int().min(1, "Indica el aforo").max(5000),
  preparacionMin: z.coerce.number().int().min(0).max(480).optional().default(60),
  porHoras: z.boolean().optional().default(false),
  precioHora: monto.nullish().transform(v => v ?? null),
  minHoras: z.coerce.number().int().min(1).max(24).nullish().transform(v => v ?? null),
  horasDesde: hora.nullish().transform(v => v || null),
  horasHasta: hora.nullish().transform(v => v || null),
  servicios: listaTextos(30, 40),
  turnos: z.array(turnoSchema).max(10),
  paquetes: z.array(paqueteSchema).min(1, "Agrega al menos un paquete (por ejemplo, Solo local)").max(20)
}).superRefine((d, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (d.porHoras) {
    if (!d.precioHora) issue(["precioHora"], "Indica el precio por hora");
    if (!d.minHoras) issue(["minHoras"], "Indica el mínimo de horas");
    if (!d.horasDesde || !d.horasHasta) issue(["horasDesde"], "Indica desde y hasta qué hora se alquila por horas");
  }
  const unico = (lista, path, que) => {
    const nombres = lista.map(x => x.nombre.toLowerCase());
    if (new Set(nombres).size !== nombres.length) issue([path], `Hay ${que} con el mismo nombre`);
  };
  unico(d.turnos, "turnos", "turnos");
  unico(d.paquetes, "paquetes", "paquetes");
  d.paquetes.forEach((p, i) => {
    if (p.modalidad === "por_horas" && !d.porHoras) issue(["paquetes", i, "modalidad"], "Activa el alquiler por horas del salón para ofrecer este paquete");
    if (p.modalidad !== "por_horas" && !d.turnos.length) issue(["turnos"], "Agrega al menos un turno para ofrecer paquetes por turno");
    if (p.maxPersonas && p.maxPersonas > d.aforoMaximo) issue(["paquetes", i, "maxPersonas"], `No puede pasar del aforo del salón (${d.aforoMaximo})`);
    if (p.turnoRefs.some(r => r >= d.turnos.length)) issue(["paquetes", i, "turnoRefs"], "Turno inválido");
  });
});

// ---------- Locales: calendario, bloqueos, cotizaciones y cuotas (alquiler-locales) ----------

const rangoFechas = (d, ctx) => {
  if (d.desde > d.hasta) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hasta"], message: "Rango inválido" });
  else if ((Date.parse(d.hasta) - Date.parse(d.desde)) / 86_400_000 > 62) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hasta"], message: "Máximo 62 días" });
};

export const calendarioStoreQuerySchema = z.object({ tiendaId: uuid("tiendaId"), desde: fecha, hasta: fecha }).superRefine(rangoFechas);
export const calendarioAdminQuerySchema = z.object({ tiendaId: uuid("tiendaId"), productoId: uuid("productoId"), desde: fecha, hasta: fecha }).superRefine(rangoFechas);

export const bloqueoSchema = z.object({
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId"),
  fecha,
  // Un turno, unas horas, o nada (todo el día).
  turnoId: uuid("turnoId").nullish().transform(v => v || null),
  horaInicio: hora.nullish().transform(v => v || null),
  horaFin: hora.nullish().transform(v => v || null),
  motivo: textoOpcional(100)
}).refine(d => !d.horaInicio === !d.horaFin, { path: ["horaFin"], message: "Indica la hora de inicio y la de fin" });

const clienteCotizacionSchema = z.object({
  nombre: textoOpcional(100),
  whatsapp: z.string().trim().regex(/^\+?[0-9\s-]{9,20}$/, "Número de WhatsApp inválido").nullish().transform(v => v || null),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(100).nullish().or(z.literal("")).transform(v => v || null)
}).nullish().transform(v => v ?? null);

const cotizacionLocalBase = {
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId"),
  paqueteId: uuid("paqueteId"),
  turnoId: uuid("turnoId").nullish().transform(v => v || null),
  fecha,
  hora: hora.nullish().transform(v => v || null),
  horas: z.coerce.number().int().min(1).max(24).nullish().transform(v => v ?? null),
  invitados: z.coerce.number({ invalid_type_error: "Indica el número de invitados" }).int().min(1, "Indica el número de invitados").max(5000),
  tipoEvento: z.enum(TIPOS_EVENTO, { message: "Elige el tipo de evento" }),
  proveedoresExternos: z.boolean().optional().default(false),
  canalOrigen: z.enum(CANALES_ORIGEN).nullish().transform(v => v ?? null),
  cliente: clienteCotizacionSchema
};

export const cotizacionLocalSchema = z.object(cotizacionLocalBase);

/** El negocio cotiza después de una visita o un chat, con ajuste y motivo (R4.4). */
export const cotizacionAdminSchema = z.object({
  ...cotizacionLocalBase,
  nuevoTotal: monto.nullish().transform(v => v ?? null),
  ajusteMotivo: textoOpcional(200)
}).superRefine((d, ctx) => {
  if (d.nuevoTotal !== null && !d.ajusteMotivo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ajusteMotivo"], message: "Explica el ajuste al cliente" });
  }
});

export const listarCotizacionesQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  productoId: uuid("productoId").optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const aceptarContratoSchema = z.object({
  version: z.coerce.number().int().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/, "Contrato inválido"),
  acepta: z.literal(true, { errorMap: () => ({ message: "Marca la casilla para aceptar el contrato" }) })
});

export const cuotaStoreParamSchema = z.object({ token: z.string().min(10).max(2000), cuotaId: uuid("cuotaId") });
export const cuotaAdminParamSchema = z.object({ id: uuid("id"), cuotaId: uuid("cuotaId") });

/** Captura de una cuota: la imagen es opcional si hay número de operación (R14.6). */
export const capturaCuotaBodySchema = z.object({
  metodo: z.enum(METODOS_PAGO_MANUAL, { message: "Elige cómo pagaste" }),
  numeroOperacion: textoOpcional(40)
});

export const planPagosSchema = z.object({
  tiendaId: uuid("tiendaId"),
  cuotas: z.array(z.object({
    concepto: z.enum(["separacion", "cuota", "saldo", "garantia"]),
    monto: monto.refine(v => v > 0, "Cada cuota debe ser mayor a 0"),
    venceEn: fecha
  })).min(1).max(15)
});

// ---------- Tarifas del hotel (hospedaje-completo B2, B3) ----------

export const COBROS_EXTRA = ["estadia", "noche", "persona", "persona_noche"];

export const temporadaSchema = z.object({
  tiendaId: uuid("tiendaId"),
  nombre: texto("Nombre", 1, 60),
  desde: fecha,
  hasta: fecha,
  ajustePct: z.coerce.number().int("El ajuste es un número entero").min(-50, "El descuento máximo es 50 %").max(300, "El recargo máximo es 300 %"),
  minNoches: z.coerce.number().int().min(1).max(30).nullish().transform(v => v ?? null),
  productoIds: z.array(uuid("productoId")).max(50).optional().default([]),
  activo: z.boolean().optional().default(true)
}).refine(d => d.desde <= d.hasta, { path: ["hasta"], message: "La fecha final no puede ser anterior a la inicial" })
  .refine(d => d.ajustePct !== 0 || d.minNoches, { path: ["ajustePct"], message: "Indica un ajuste de precio o un mínimo de noches" });

export const planSchema = z.object({
  tiendaId: uuid("tiendaId"),
  nombre: texto("Nombre", 1, 60),
  descripcion: textoOpcional(200),
  ajustePct: z.coerce.number().int("El ajuste es un número entero").min(-50, "El descuento máximo es 50 %").max(0, "Un plan solo puede bajar el precio"),
  reembolsable: z.boolean().optional().default(false),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).max(999).optional().default(0)
});

export const disponibilidadQuerySchema = z.object({
  tiendaId: uuid("tiendaId"),
  desde: fecha,
  hasta: fecha
}).refine(d => d.desde <= d.hasta, { path: ["hasta"], message: "Rango inválido" })
  .refine(d => (Date.parse(d.hasta) - Date.parse(d.desde)) / 86_400_000 <= 62, { path: ["hasta"], message: "Máximo 62 días" });

export const extraSchema = z.object({
  tiendaId: uuid("tiendaId"),
  nombre: texto("Nombre", 1, 60),
  descripcion: textoOpcional(200),
  precio: monto,
  cobro: z.enum(COBROS_EXTRA, { message: "Elige cómo se cobra" }),
  datoPedido: textoOpcional(80),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).max(999).optional().default(0)
});
