import { ahoraPublico } from "./hotel/recepcion.service.js";
import { Router } from "express";
import config from "../../config/index.js";
import { crearLimitador } from "../../kernel/http/rate-limit.js";
import { logger } from "../../config/logger.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { optionalAuth, scopeBodyToTienda, scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { NotFoundError } from "../../utils/errors.js";
import { configPublica, obtenerConfig } from "./reservas.config.service.js";
import { cierresPublicos } from "./cierres.service.js";
import { listarHabitacionesStore, obtenerHabitacionStore } from "./hotel/habitaciones.service.js";
import { extrasPublicos, planesPublicos, temporadasPublicas } from "./hotel/tarifas.service.js";
import { disponibilidadTienda } from "./hotel/disponibilidad.service.js";
import { preciosPorNoche } from "./hotel/precios-calendario.js";
import { listarToursStore, obtenerTourStore } from "./tours/tours.service.js";
import { listarEventosStore, obtenerEventoStore } from "./eventos/eventos.service.js";
import { listarSalonesStore, obtenerSalonStore } from "./locales/salones.service.js";
import { calendarioStore, crearCotizacion, disponibilidadSalones, obtenerCotizacionStore } from "./locales/locales.service.js";
import { aceptarContrato, subirCapturaCuota } from "./locales/cuotas.service.js";
import { agendaStore as agendaCanchasStore, listarCanchasStore, obtenerCanchaStore } from "./canchas/canchas.service.js";
import { clientIp } from "../../kernel/http/client-ip.js";
import { verificarTokenReserva } from "./reservas.token.js";
import { uploadCaptura } from "./reservas.capturas.js";
import { pagarReserva } from "./reservas.pago.js";
import { dividirPago, obtenerParte, pagarParte, partesDeReserva } from "./canchas/partes.js";
import { registrarCheckin, solicitarCambioFechas } from "./hotel/estadia-cliente.js";
import { pagarReservaSchema } from "../pagos/pasarela/pasarela.schema.js";
import { z } from "zod";

const disponibilidadDiaSchema = z.object({
  tiendaId: z.string().uuid("tiendaId inválido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
});

const dividirPagoSchema = z.object({ partes: z.coerce.number().int().min(2, "Divide entre 2 o más").max(22, "Hasta 22 jugadores") });
import {
  cancelarPorCliente, cotizar, crearSolicitud, notificarSolicitud, obtenerSeguimiento, subirCapturaCliente, urlSeguimiento
} from "./reservas.service.js";
import {
  capturaBodySchema, cierresQuerySchema, cotizarSchema, crearSolicitudSchema, slugParamSchema, tiendaQuerySchema, tokenParamSchema,
  disponibilidadQuerySchema, calendarioStoreQuerySchema, cotizacionLocalSchema, aceptarContratoSchema, cuotaStoreParamSchema, capturaCuotaBodySchema,
  agendaCanchasStoreQuerySchema
} from "./reservas.schema.js";

/**
 * Mini booking — storefront (docs/specs/mini-booking). Público: la vitrina
 * no requiere login; la reserva se sigue con un link firmado.
 */

const router = Router();

// Anti-abuso de escritura, aparte del limiter global (spec R5.7).
const solicitudesLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.reservas.rateLimitMax,
  code: "TOO_MANY_BOOKINGS",
  message: "Enviaste varias solicitudes en poco tiempo. Espera unos minutos e intenta de nuevo."
});

// Cotizaciones de locales guardadas: más holgado que las solicitudes (se cotiza
// varias veces antes de decidir), pero con tope propio (alquiler-locales R14.8).
const cotizacionesLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.reservas.cotizacionesMax,
  code: "TOO_MANY_QUOTES",
  message: "Hiciste muchas cotizaciones en poco tiempo. Espera unos minutos e intenta de nuevo."
});

// Pago en línea: mismo tope que el cargo del checkout (procesar cargos es sensible).
const pagoLimiter = crearLimitador({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.checkoutMax,
  code: "TOO_MANY_PAYMENTS",
  message: "Demasiados intentos de pago en poco tiempo, intenta más tarde"
});

const ok = (res, code, data, status = 200) => apiResponse(res, { status, type: "SUCCESS", code, data });
/** Código del idioma de la petición, ya resuelto por resolverIdioma (docs/specs/idiomas D2). */
const langDe = (req) => req.idioma.codigo;
/** Cotizar y reservar: el `lang` del body pasa a ser el idioma resuelto (no el que mandó el cliente). */
const conIdioma = (req, _res, next) => { req.body.lang = langDe(req); next(); };

/** Resuelve el token y verifica que sea de la tienda del subdominio (si hay). */
async function reservaDelToken(req) {
  const { pedidoId, tiendaId } = await verificarTokenReserva(req.params.token);
  if (req.tiendaId && req.tiendaId !== tiendaId) throw new NotFoundError("Reserva", "Reserva no encontrada");
  return { pedidoId, tiendaId };
}

// GET /config?tiendaId= — reglas visibles en la vitrina (cobro, horarios, política)
router.get("/config", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId } = req.validatedQuery;
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "RESERVAS_CONFIG", configPublica(await obtenerConfig(tiendaId), langDe(req)));
  } catch (error) { next(error); }
});

// GET /habitaciones?tiendaId= — vitrina del hotel
router.get("/habitaciones", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "HABITACIONES_LIST", await listarHabitacionesStore(req.validatedQuery.tiendaId, langDe(req)));
  } catch (error) { next(error); }
});

// GET /ahora?tiendaId= — hostal al paso (docs/specs/recepcion R8): tipos, tarifas y
// si hay una habitación libre ahora. Caché corto: cambia con cada entrada y salida.
router.get("/ahora", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=20");
    return ok(res, "RESERVAS_AHORA", await ahoraPublico(req.validatedQuery.tiendaId, langDe(req)));
  } catch (error) { next(error); }
});

// GET /tarifas?tiendaId= — extras reservables y temporadas vigentes del hotel
// (hospedaje-completo B2, B3): la ficha ofrece los extras y avisa el mínimo de noches.
router.get("/tarifas", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId } = req.validatedQuery;
    res.set("Cache-Control", "public, max-age=60");
    const lang = langDe(req);
    const [extras, temporadas, planes] = await Promise.all([extrasPublicos(tiendaId, lang), temporadasPublicas(tiendaId, new Date(), lang), planesPublicos(tiendaId, lang)]);
    return ok(res, "TARIFAS_HOTEL", { extras, temporadas, planes });
  } catch (error) { next(error); }
});

// GET /habitaciones-disponibilidad?tiendaId=&desde=&hasta= — libres por tipo y noche
// (C1): la grilla oculta los tipos llenos para la búsqueda. Solo tipos con inventario.
router.get("/habitaciones-disponibilidad", validate({ query: disponibilidadQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId, desde, hasta } = req.validatedQuery;
    res.set("Cache-Control", "public, max-age=30");
    const lista = await disponibilidadTienda(tiendaId, desde, hasta);
    return ok(res, "DISPONIBILIDAD", lista.map(t => ({
      productoId: t.productoId,
      libres: Object.fromEntries(Object.entries(t.fechas).map(([f, v]) => [f, v.libres]))
    })));
  } catch (error) { next(error); }
});

// GET /habitaciones-precios?tiendaId=&desde=&hasta= — precio por noche de cada tipo
// para el calendario (reserva-hotel-mejoras H1); null = cerrado.
router.get("/habitaciones-precios", validate({ query: disponibilidadQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId, desde, hasta } = req.validatedQuery;
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "PRECIOS_NOCHE", await preciosPorNoche(tiendaId, desde, hasta));
  } catch (error) { next(error); }
});

// GET /habitaciones/:slug?tiendaId= — ficha con modalidades
router.get("/habitaciones/:slug", validate({ params: slugParamSchema, query: tiendaQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      return ok(res, "HABITACION", await obtenerHabitacionStore(req.validatedQuery.tiendaId, req.params.slug, langDe(req)));
    } catch (error) { next(error); }
  });

// GET /tours?tiendaId= — vitrina de la agencia
router.get("/tours", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "TOURS_LIST", await listarToursStore(req.validatedQuery.tiendaId, langDe(req)));
  } catch (error) { next(error); }
});

// GET /tours/:slug?tiendaId= — ficha con días y horas de salida y tipos de pasajero
router.get("/tours/:slug", validate({ params: slugParamSchema, query: tiendaQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      return ok(res, "TOUR", await obtenerTourStore(req.validatedQuery.tiendaId, req.params.slug, langDe(req)));
    } catch (error) { next(error); }
  });

// GET /eventos?tiendaId= — próximos eventos con sus funciones
router.get("/eventos", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    // Cache corto: el cupo cambia con cada compra.
    res.set("Cache-Control", "public, max-age=15");
    return ok(res, "EVENTOS_LIST", await listarEventosStore(req.validatedQuery.tiendaId));
  } catch (error) { next(error); }
});

// GET /eventos/:slug?tiendaId= — ficha con funciones y entradas (disponible / últimas / agotado)
router.get("/eventos/:slug", validate({ params: slugParamSchema, query: tiendaQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      return ok(res, "EVENTO", await obtenerEventoStore(req.validatedQuery.tiendaId, req.params.slug));
    } catch (error) { next(error); }
  });

// GET /locales/salones?tiendaId= — salones del local de eventos (alquiler-locales R2)
router.get("/locales/salones", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "SALONES_LIST", await listarSalonesStore(req.validatedQuery.tiendaId));
  } catch (error) { next(error); }
});

// GET /locales/disponibilidad?tiendaId=&fecha= — estado de cada salón ese día (plantillas-por-rubro E9)
router.get("/locales/disponibilidad", validate({ query: disponibilidadDiaSchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=30");
    return ok(res, "SALONES_DISPONIBILIDAD", await disponibilidadSalones(req.validatedQuery.tiendaId, req.validatedQuery.fecha));
  } catch (error) { next(error); }
});

// GET /locales/salones/:slug?tiendaId= — ficha con turnos, paquetes y servicios
router.get("/locales/salones/:slug", validate({ params: slugParamSchema, query: tiendaQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      return ok(res, "SALON", await obtenerSalonStore(req.validatedQuery.tiendaId, req.params.slug));
    } catch (error) { next(error); }
  });

// GET /locales/salones/:slug/calendario?tiendaId=&desde=&hasta= — libre / parcial / ocupada / cerrada por fecha y turno (R3.1)
router.get("/locales/salones/:slug/calendario", validate({ params: slugParamSchema, query: calendarioStoreQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      const { tiendaId, desde, hasta } = req.validatedQuery;
      // Corto: la disponibilidad cambia con cada solicitud. Se revalida al cotizar y al enviar (R3.5).
      res.set("Cache-Control", "public, max-age=15");
      return ok(res, "SALON_CALENDARIO", await calendarioStore(tiendaId, req.params.slug, { desde, hasta }));
    } catch (error) { next(error); }
  });

// POST /locales/cotizaciones — cotiza y guarda con precio congelado (R4.2). 409 con alternativas si la franja está ocupada.
router.post("/locales/cotizaciones", cotizacionesLimiter, scopeBodyToTienda, validate({ body: cotizacionLocalSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...datos } = req.body;
    return ok(res, "COTIZACION_CREADA", await crearCotizacion(tiendaId, datos, { creadaPor: "cliente" }), 201);
  } catch (error) { next(error); }
});

// GET /locales/cotizaciones/:token — la cotización (vigente, vencida o usada) y si la fecha sigue libre
router.get("/locales/cotizaciones/:token", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return ok(res, "COTIZACION", await obtenerCotizacionStore(req.params.token, req.tiendaId ?? null));
  } catch (error) { next(error); }
});

// GET /canchas?tiendaId= — canchas del complejo con formato y precio día/noche (alquiler-canchas R1)
router.get("/canchas", validate({ query: tiendaQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    return ok(res, "CANCHAS_LIST", await listarCanchasStore(req.validatedQuery.tiendaId));
  } catch (error) { next(error); }
});

// GET /canchas/agenda?tiendaId=&fecha= — bloques de 30 min del día (tarifa, pasados) y los ocupados de cada cancha (R3, R4)
router.get("/canchas/agenda", validate({ query: agendaCanchasStoreQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId, fecha } = req.validatedQuery;
    // Corto: cambia con cada reserva. Se revalida al cotizar y al enviar (la BD decide).
    res.set("Cache-Control", "public, max-age=15");
    return ok(res, "CANCHAS_AGENDA", await agendaCanchasStore(tiendaId, fecha));
  } catch (error) { next(error); }
});

// GET /canchas/:slug?tiendaId= — ficha de la cancha
router.get("/canchas/:slug", validate({ params: slugParamSchema, query: tiendaQuerySchema }), scopeQueryToTienda,
  async (req, res, next) => {
    try {
      res.set("Cache-Control", "public, max-age=60");
      return ok(res, "CANCHA", await obtenerCanchaStore(req.validatedQuery.tiendaId, req.params.slug));
    } catch (error) { next(error); }
  });

// GET /cierres?tiendaId=&desde=&hasta=&productoId= — fechas no elegibles del calendario
router.get("/cierres", validate({ query: cierresQuerySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId, ...filtros } = req.validatedQuery;
    return ok(res, "RESERVAS_CIERRES", await cierresPublicos(tiendaId, filtros));
  } catch (error) { next(error); }
});

// POST /cotizar — total, desglose, salida calculada, aviso y errores (sin crear nada)
router.post("/cotizar", scopeBodyToTienda, validate({ body: cotizarSchema }), conIdioma, async (req, res, next) => {
  try {
    return ok(res, "RESERVA_COTIZACION", await cotizar(req.body));
  } catch (error) { next(error); }
});

// POST / — enviar la solicitud de reserva
router.post("/", solicitudesLimiter, optionalAuth, scopeBodyToTienda, validate({ body: crearSolicitudSchema }), conIdioma,
  async (req, res, next) => {
    try {
      // Honeypot: al bot se le responde como si se hubiera creado, para que no aprenda a evitarlo.
      if (req.body.sitioWeb) {
        logger.warn(`🪤 Reservas: honeypot activado en la tienda ${req.body.tiendaId}`);
        return ok(res, "RESERVA_SOLICITADA", { codigo: null, token: null }, 201);
      }
      const resultado = await crearSolicitud(req.body, { authUserId: req.user?.id ?? null });
      if (resultado.nueva) notificarSolicitud(resultado);
      return ok(res, "RESERVA_SOLICITADA", {
        codigo: resultado.pedido.numeroPedido,
        token: resultado.token,
        url: urlSeguimiento(resultado.tienda.slug, resultado.token)
      }, resultado.nueva ? 201 : 200);
    } catch (error) { next(error); }
  });

// GET /seguimiento/:token — estado, datos de pago y confirmación
router.get("/seguimiento/:token", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    res.set("Cache-Control", "private, no-store");
    return ok(res, "RESERVA", await obtenerSeguimiento(tiendaId, pedidoId));
  } catch (error) { next(error); }
});

// POST /seguimiento/:token/captura — subir el comprobante del pago manual (multipart: captura, metodo, numeroOperacion)
router.post("/seguimiento/:token/captura", solicitudesLimiter, validate({ params: tokenParamSchema }), uploadCaptura,
  validate({ body: capturaBodySchema }), async (req, res, next) => {
    try {
      const { pedidoId, tiendaId } = await reservaDelToken(req);
      const data = await subirCapturaCliente(tiendaId, pedidoId, { file: req.file, ...req.body });
      return ok(res, "RESERVA_CAPTURA_SUBIDA", data);
    } catch (error) { next(error); }
  });

// POST /seguimiento/:token/pago — pago automático con la pasarela (docs/specs/pago-automatico R3):
// { tokenId, metodo, cuotaId? }. Devuelve { pago, reserva }; un rechazo responde 422.
router.post("/seguimiento/:token/pago", pagoLimiter, validate({ params: tokenParamSchema, body: pagarReservaSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    res.set("Cache-Control", "private, no-store");
    return ok(res, "RESERVA_PAGO", await pagarReserva(tiendaId, pedidoId, req.body), 201);
  } catch (error) { next(error); }
});

// Hotel antes de llegar (plantillas-por-rubro E8)
const personaCheckin = z.object({
  nombres: z.string().trim().min(1).max(100), apellidos: z.string().trim().min(1).max(100),
  docTipo: z.enum(["DNI", "CE", "PASAPORTE"]), docNumero: z.string().trim().min(6).max(20)
});
const checkinSchema = z.object({
  acompanantes: z.array(personaCheckin).max(20).default([]),
  horaLlegada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
  comentarios: z.string().trim().max(500).nullish().transform(v => v || null)
});
const cambioFechasSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  noches: z.coerce.number().int().min(1).max(60),
  comentario: z.string().trim().max(500).nullish().transform(v => v || null)
});

// POST /seguimiento/:token/checkin — datos de los acompañantes y hora de llegada
router.post("/seguimiento/:token/checkin", solicitudesLimiter, validate({ params: tokenParamSchema, body: checkinSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    return ok(res, "RESERVA_CHECKIN", await registrarCheckin(tiendaId, pedidoId, req.body));
  } catch (error) { next(error); }
});

// POST /seguimiento/:token/cambio-fechas — pide otras fechas (el hotel decide)
router.post("/seguimiento/:token/cambio-fechas", solicitudesLimiter, validate({ params: tokenParamSchema, body: cambioFechasSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    return ok(res, "RESERVA_CAMBIO_SOLICITADO", await solicitarCambioFechas(tiendaId, pedidoId, req.body));
  } catch (error) { next(error); }
});

// Pago dividido de canchas (plantillas-por-rubro E7)
// POST /seguimiento/:token/dividir { partes } — divide el total entre N jugadores
router.post("/seguimiento/:token/dividir", solicitudesLimiter, validate({ params: tokenParamSchema, body: dividirPagoSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    await dividirPago(tiendaId, pedidoId, req.body.partes);
    return ok(res, "RESERVA_DIVIDIDA", await partesDeReserva(tiendaId, pedidoId));
  } catch (error) { next(error); }
});

// GET /seguimiento/:token/partes — las partes con sus links para compartir
router.get("/seguimiento/:token/partes", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    res.set("Cache-Control", "private, no-store");
    return ok(res, "RESERVA_PARTES", await partesDeReserva(tiendaId, pedidoId));
  } catch (error) { next(error); }
});

// GET /partes/:token — lo que ve un jugador con su link de pago
router.get("/partes/:token", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return ok(res, "RESERVA_PARTE", await obtenerParte(req.params.token));
  } catch (error) { next(error); }
});

// POST /partes/:token/pago { tokenId, metodo } — el jugador paga su parte
router.post("/partes/:token/pago", pagoLimiter, validate({ params: tokenParamSchema, body: pagarReservaSchema }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return ok(res, "RESERVA_PARTE_PAGO", await pagarParte(req.params.token, req.body), 201);
  } catch (error) { next(error); }
});

// POST /seguimiento/:token/contrato — el cliente acepta el contrato que leyó (versión + hash, R8.3)
router.post("/seguimiento/:token/contrato", validate({ params: tokenParamSchema, body: aceptarContratoSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    return ok(res, "RESERVA_CONTRATO_ACEPTADO", await aceptarContrato(tiendaId, pedidoId, req.body, { ip: clientIp(req) ?? null }));
  } catch (error) { next(error); }
});

// POST /seguimiento/:token/cuotas/:cuotaId/captura — pago manual de una cuota (multipart: captura opcional, metodo, numeroOperacion)
router.post("/seguimiento/:token/cuotas/:cuotaId/captura", solicitudesLimiter, validate({ params: cuotaStoreParamSchema }), uploadCaptura,
  validate({ body: capturaCuotaBodySchema }), async (req, res, next) => {
    try {
      const { pedidoId, tiendaId } = await reservaDelToken(req);
      return ok(res, "RESERVA_CUOTA_CAPTURA", await subirCapturaCuota(tiendaId, pedidoId, req.params.cuotaId, { file: req.file, ...req.body }));
    } catch (error) { next(error); }
  });

// POST /seguimiento/:token/cancelar — el cliente cancela antes de confirmar
router.post("/seguimiento/:token/cancelar", validate({ params: tokenParamSchema }), async (req, res, next) => {
  try {
    const { pedidoId, tiendaId } = await reservaDelToken(req);
    return ok(res, "RESERVA_CANCELADA", await cancelarPorCliente(tiendaId, pedidoId));
  } catch (error) { next(error); }
});

export default router;
