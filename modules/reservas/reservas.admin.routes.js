import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { guardarConfig, obtenerConfig } from "./reservas.config.service.js";
import { crearCierre, eliminarCierre, listarCierres } from "./cierres.service.js";
import { guardarFicha, listarHabitacionesAdmin, obtenerFichaAdmin } from "./hotel/habitaciones.service.js";
import {
  actualizarExtra, actualizarTemporada, crearExtra, crearTemporada, eliminarExtra, eliminarTemporada, listarExtras, listarTemporadas,
  actualizarPlan, crearPlan, eliminarPlan, listarPlanes
} from "./hotel/tarifas.service.js";
import { disponibilidadTienda } from "./hotel/disponibilidad.service.js";
import { detalleNoche, fijarLibres } from "./hotel/cupo.service.js";
import { guardarFichaTour, listarToursAdmin, obtenerFichaTourAdmin } from "./tours/tours.service.js";
import { asistentesFuncion, guardarFichaEvento, listarEventosAdmin, obtenerFichaEventoAdmin } from "./eventos/eventos.service.js";
import { resumenIngreso, validarEntrada } from "./eventos/entradas.js";
import { validarEntradaSchema } from "./reservas.schema.js";
import { guardarFichaSalon, listarSalonesAdmin, obtenerFichaSalonAdmin } from "./locales/salones.service.js";
import { calendarioAdmin, crearBloqueo, crearCotizacion, eliminarBloqueo, listarCotizacionesAdmin } from "./locales/locales.service.js";
import { editarPlan, rechazarCuota, verificarCuota } from "./locales/cuotas.service.js";
import {
  agendaAdmin as agendaCanchasAdmin, crearBloqueo as crearBloqueoCancha, eliminarBloqueo as eliminarBloqueoCancha,
  guardarFichaCancha, listarCanchasAdmin, obtenerFichaCanchaAdmin
} from "./canchas/canchas.service.js";
import {
  aceptarReserva, agendaReservas, cancelarPorNegocio, detalleReservaAdmin, listarReservasAdmin, marcarNoShow,
  rechazarPago, rechazarReserva, reenviarCorreo, resumenHotel, resumenReservas, verificarPago
} from "./reservas.service.js";
import {
  aceptarSchema, agendaQuerySchema, configSchema, crearCierreSchema, habitacionSchema, idParamSchema,
  listarAdminQuerySchema, motivoSchema, productoParamSchema, rechazarPagoSchema, rechazarSchema, tiendaQuerySchema, tourSchema,
  eventoSchema, funcionParamSchema, temporadaSchema, extraSchema, planSchema, disponibilidadQuerySchema, salonSchema,
  calendarioAdminQuerySchema, bloqueoSchema, cotizacionAdminSchema, listarCotizacionesQuerySchema, cuotaAdminParamSchema, planPagosSchema,
  canchaSchema, agendaCanchasAdminQuerySchema, bloqueoCanchaSchema, nocheQuerySchema, fijarLibresSchema,
  checkinSchema, checkoutSchema, codigoPmsSchema, notaSchema, modificarSchema, cambiarSalidaSchema, cancelarHotelSchema,
  responderHorarioSchema, salidaTardiaSchema
} from "./reservas.schema.js";
import {
  agregarNota, cambiarSalida, cancelarHotel, darSalidaTardia, guardarCodigoPms, marcarNoLlego, modificarReserva,
  registrarCheckin, registrarCheckout, responderHorario
} from "./hotel/ciclo.service.js";

/**
 * Mini booking — panel del negocio (docs/specs/mini-booking).
 *
 * Roles: ver, cualquier miembro (viewer+). Responder solicitudes y verificar
 * pagos, editor+ (en un hostal pequeño el recepcionista suele ser editor).
 * Configuración, habitaciones, tours, eventos, salones y fechas cerradas, admin+.
 */

const router = Router();
const ok = (res, code, data, meta) => apiResponse(res, { status: 200, type: "SUCCESS", code, data, ...(meta ? { meta } : {}) });

const lectura = [authMiddleware, requireTiendaAccess("viewer")];
const operacion = [authMiddleware, requireTiendaAccess("editor")];
const gestion = [authMiddleware, requireTiendaAccess("admin")];

// ---------- Configuración ----------

router.get("/config", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVAS_CONFIG", await obtenerConfig(req.tiendaId)); } catch (error) { next(error); }
});

router.put("/config", ...gestion, validate({ body: configSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...data } = req.body;
    return ok(res, "RESERVAS_CONFIG_UPDATED", await guardarConfig(req.tiendaId, data, req.user));
  } catch (error) { next(error); }
});

// ---------- Fechas cerradas ----------

router.get("/cierres", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVAS_CIERRES", await listarCierres(req.tiendaId)); } catch (error) { next(error); }
});

router.post("/cierres", ...gestion, validate({ body: crearCierreSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVAS_CIERRE_CREADO", await crearCierre(req.tiendaId, req.body, req.user)); } catch (error) { next(error); }
});

router.delete("/cierres/:id", ...gestion, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res, next) => {
  try {
    await eliminarCierre(req.tiendaId, req.params.id);
    return ok(res, "RESERVAS_CIERRE_ELIMINADO", null);
  } catch (error) { next(error); }
});

// ---------- Tarifas del hotel: temporadas y extras (hospedaje-completo B2, B3) ----------

const crud = (ruta, codigo, { listar, crear, actualizar, eliminar }, schema) => {
  router.get(`/${ruta}`, ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
    try { return ok(res, `${codigo}S`, await listar(req.tiendaId)); } catch (error) { next(error); }
  });
  router.post(`/${ruta}`, ...gestion, validate({ body: schema }), async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, `${codigo}_CREADA`, await crear(req.tiendaId, data, req.user));
    } catch (error) { next(error); }
  });
  router.put(`/${ruta}/:id`, ...gestion, validate({ params: idParamSchema, body: schema }), async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, `${codigo}_ACTUALIZADA`, await actualizar(req.tiendaId, req.params.id, data, req.user));
    } catch (error) { next(error); }
  });
  router.delete(`/${ruta}/:id`, ...gestion, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res, next) => {
    try {
      await eliminar(req.tiendaId, req.params.id);
      return ok(res, `${codigo}_ELIMINADA`, null);
    } catch (error) { next(error); }
  });
};

crud("temporadas", "TEMPORADA", {
  listar: listarTemporadas, crear: crearTemporada, actualizar: actualizarTemporada, eliminar: eliminarTemporada
}, temporadaSchema);
crud("planes", "PLAN", {
  listar: listarPlanes, crear: crearPlan, actualizar: actualizarPlan, eliminar: eliminarPlan
}, planSchema);
crud("extras", "EXTRA", {
  listar: listarExtras, crear: crearExtra, actualizar: actualizarExtra, eliminar: eliminarExtra
}, extraSchema);

// ---------- Disponibilidad (C1) y cupo a la venta (motor-reservas-hotel M2) ----------

router.get("/disponibilidad", ...lectura, validate({ query: disponibilidadQuerySchema }), async (req, res, next) => {
  try {
    const { desde, hasta } = req.validatedQuery;
    return ok(res, "DISPONIBILIDAD", await disponibilidadTienda(req.tiendaId, desde, hasta, { detalle: true }));
  } catch (error) { next(error); }
});

// GET /disponibilidad/noche?productoId=&fecha= — qué ocupa un tipo esa noche (M2.5)
router.get("/disponibilidad/noche", ...lectura, validate({ query: nocheQuerySchema }), async (req, res, next) => {
  try {
    const { productoId, fecha } = req.validatedQuery;
    return ok(res, "DISPONIBILIDAD_NOCHE", await detalleNoche(req.tiendaId, productoId, fecha));
  } catch (error) { next(error); }
});

// PUT /disponibilidad/libres — el dueño fija cuántas quedan a la venta (M2.2, M2.3).
// Editor+: la recepcionista lo pasa desde el PMS o el Excel del hotel.
router.put("/disponibilidad/libres", ...operacion, validate({ body: fijarLibresSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...data } = req.body;
    return ok(res, "LIBRES_FIJADOS", await fijarLibres(req.tiendaId, data, req.user));
  } catch (error) { next(error); }
});

// ---------- Habitaciones (ficha de hotel de un producto) ----------

router.get("/habitaciones", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "HABITACIONES_ADMIN", await listarHabitacionesAdmin(req.tiendaId)); } catch (error) { next(error); }
});

router.get("/habitaciones/:productoId", ...lectura, validate({ params: productoParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "HABITACION_FICHA", await obtenerFichaAdmin(req.tiendaId, req.params.productoId)); } catch (error) { next(error); }
  });

router.put("/habitaciones/:productoId", ...gestion, validate({ params: productoParamSchema, body: habitacionSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, "HABITACION_FICHA_UPDATED", await guardarFicha(req.tiendaId, req.params.productoId, data, req.user));
    } catch (error) { next(error); }
  });

// ---------- Tours (ficha de tour de un producto) ----------

router.get("/tours", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "TOURS_ADMIN", await listarToursAdmin(req.tiendaId)); } catch (error) { next(error); }
});

router.get("/tours/:productoId", ...lectura, validate({ params: productoParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "TOUR_FICHA", await obtenerFichaTourAdmin(req.tiendaId, req.params.productoId)); } catch (error) { next(error); }
  });

router.put("/tours/:productoId", ...gestion, validate({ params: productoParamSchema, body: tourSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, "TOUR_FICHA_UPDATED", await guardarFichaTour(req.tiendaId, req.params.productoId, data, req.user));
    } catch (error) { next(error); }
  });

// ---------- Eventos (ficha, funciones y entradas de un producto) ----------

router.get("/eventos", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "EVENTOS_ADMIN", await listarEventosAdmin(req.tiendaId)); } catch (error) { next(error); }
});

// Control de ingreso con QR (plantillas-por-rubro E6): valida el código y marca la entrada usada.
// 404 si no existe; 409 YA_USADA | ANULADA | OTRA_FUNCION con los datos de la entrada.
router.post("/eventos/entradas/validar", ...operacion, validate({ body: validarEntradaSchema }), async (req, res, next) => {
  try {
    return ok(res, "ENTRADA_VALIDADA", await validarEntrada(req.tiendaId, req.body.codigo, req.user, { funcionId: req.body.funcionId ?? null }));
  } catch (error) { next(error); }
});

router.get("/eventos/funciones/:funcionId/ingreso", ...lectura, validate({ params: funcionParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "EVENTO_INGRESO", await resumenIngreso(req.tiendaId, req.params.funcionId)); } catch (error) { next(error); }
  });

// Lista de asistentes de una función (control de ingreso a mano, junto con el QR).
router.get("/eventos/funciones/:funcionId/asistentes", ...lectura, validate({ params: funcionParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "EVENTO_ASISTENTES", await asistentesFuncion(req.tiendaId, req.params.funcionId)); } catch (error) { next(error); }
  });

router.get("/eventos/:productoId", ...lectura, validate({ params: productoParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "EVENTO_FICHA", await obtenerFichaEventoAdmin(req.tiendaId, req.params.productoId)); } catch (error) { next(error); }
  });

router.put("/eventos/:productoId", ...gestion, validate({ params: productoParamSchema, body: eventoSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, "EVENTO_FICHA_UPDATED", await guardarFichaEvento(req.tiendaId, req.params.productoId, data, req.user));
    } catch (error) { next(error); }
  });

// ---------- Locales: salones con turnos y paquetes (alquiler-locales R2) ----------

router.get("/locales/salones", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "SALONES_ADMIN", await listarSalonesAdmin(req.tiendaId)); } catch (error) { next(error); }
});

router.get("/locales/salones/:productoId", ...lectura, validate({ params: productoParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "SALON_FICHA", await obtenerFichaSalonAdmin(req.tiendaId, req.params.productoId)); } catch (error) { next(error); }
  });

// 409 CAMBIO_CON_RESERVAS (con la lista) si baja el aforo o quita un turno con reservas en curso (R2.7).
router.put("/locales/salones/:productoId", ...gestion, validate({ params: productoParamSchema, body: salonSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, "SALON_FICHA_UPDATED", await guardarFichaSalon(req.tiendaId, req.params.productoId, data, req.user));
    } catch (error) { next(error); }
  });

// Calendario del salón (R12.2): reservas, apartados, bloqueos y cierres.
router.get("/locales/calendario", ...lectura, validate({ query: calendarioAdminQuerySchema }), async (req, res, next) => {
  try {
    const { productoId, desde, hasta } = req.validatedQuery;
    return ok(res, "LOCAL_CALENDARIO", await calendarioAdmin(req.tiendaId, { productoId, desde, hasta }));
  } catch (error) { next(error); }
});

// Bloqueo manual: "la vendí por WhatsApp" (R3.6). Editor+: lo hace quien atiende.
router.post("/locales/bloqueos", ...operacion, validate({ body: bloqueoSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...data } = req.body;
    return ok(res, "LOCAL_BLOQUEO_CREADO", await crearBloqueo(req.tiendaId, data, req.user));
  } catch (error) { next(error); }
});

router.delete("/locales/bloqueos/:id", ...operacion, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res, next) => {
  try {
    await eliminarBloqueo(req.tiendaId, req.params.id);
    return ok(res, "LOCAL_BLOQUEO_ELIMINADO", null);
  } catch (error) { next(error); }
});

// Cotizaciones del negocio (R4.4): con ajuste y motivo; se comparten por enlace o WhatsApp.
router.get("/locales/cotizaciones", ...lectura, validate({ query: listarCotizacionesQuerySchema }), async (req, res, next) => {
  try {
    const { data, meta } = await listarCotizacionesAdmin(req.tiendaId, req.validatedQuery);
    return ok(res, "LOCAL_COTIZACIONES", data, meta);
  } catch (error) { next(error); }
});

router.post("/locales/cotizaciones", ...operacion, validate({ body: cotizacionAdminSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...datos } = req.body;
    return ok(res, "LOCAL_COTIZACION_CREADA", await crearCotizacion(req.tiendaId, datos, { creadaPor: "negocio", user: req.user }));
  } catch (error) { next(error); }
});

// ---------- Canchas: fichas, agenda y bloqueos (alquiler-canchas R1, R6) ----------

router.get("/canchas", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "CANCHAS_ADMIN", await listarCanchasAdmin(req.tiendaId)); } catch (error) { next(error); }
});

// Grilla cancha × hora del día: reservas (con código, cliente y estado), apartados y bloqueos.
router.get("/canchas/agenda", ...lectura, validate({ query: agendaCanchasAdminQuerySchema }), async (req, res, next) => {
  try { return ok(res, "CANCHAS_AGENDA", await agendaCanchasAdmin(req.tiendaId, req.validatedQuery.fecha)); } catch (error) { next(error); }
});

// Bloqueo manual: reserva por teléfono, mantenimiento, academia. 409 HORARIO_OCUPADO si choca. Editor+: lo hace quien atiende.
router.post("/canchas/bloqueos", ...operacion, validate({ body: bloqueoCanchaSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...data } = req.body;
    return ok(res, "CANCHA_BLOQUEO_CREADO", await crearBloqueoCancha(req.tiendaId, data, req.user));
  } catch (error) { next(error); }
});

router.delete("/canchas/bloqueos/:id", ...operacion, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res, next) => {
  try {
    await eliminarBloqueoCancha(req.tiendaId, req.params.id);
    return ok(res, "CANCHA_BLOQUEO_ELIMINADO", null);
  } catch (error) { next(error); }
});

router.get("/canchas/:productoId", ...lectura, validate({ params: productoParamSchema, query: tiendaQuerySchema }),
  async (req, res, next) => {
    try { return ok(res, "CANCHA_FICHA", await obtenerFichaCanchaAdmin(req.tiendaId, req.params.productoId)); } catch (error) { next(error); }
  });

router.put("/canchas/:productoId", ...gestion, validate({ params: productoParamSchema, body: canchaSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, ...data } = req.body;
      return ok(res, "CANCHA_FICHA_UPDATED", await guardarFichaCancha(req.tiendaId, req.params.productoId, data, req.user));
    } catch (error) { next(error); }
  });

// ---------- Bandeja ----------

// Bandeja del hotel: lo de hoy y el contador de cada estado del ciclo (ciclo-reserva-hotel C10).
router.get("/resumen-hotel", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVAS_RESUMEN_HOTEL", await resumenHotel(req.tiendaId)); } catch (error) { next(error); }
});

router.get("/resumen", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVAS_RESUMEN", await resumenReservas(req.tiendaId)); } catch (error) { next(error); }
});

router.get("/agenda", ...lectura, validate({ query: agendaQuerySchema }), async (req, res, next) => {
  try {
    const { desde, hasta } = req.validatedQuery;
    return ok(res, "RESERVAS_AGENDA", await agendaReservas(req.tiendaId, { desde, hasta }));
  } catch (error) { next(error); }
});

router.get("/", ...lectura, validate({ query: listarAdminQuerySchema }), async (req, res, next) => {
  try {
    const { data, meta } = await listarReservasAdmin(req.tiendaId, req.validatedQuery);
    return ok(res, "RESERVAS_LIST", data, meta);
  } catch (error) { next(error); }
});

router.get("/:id", ...lectura, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA", await detalleReservaAdmin(req.tiendaId, req.params.id)); } catch (error) { next(error); }
});

// ---------- Acciones ----------

router.post("/:id/aceptar", ...operacion, validate({ params: idParamSchema, body: aceptarSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_ACEPTADA", await aceptarReserva(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/rechazar", ...operacion, validate({ params: idParamSchema, body: rechazarSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_RECHAZADA", await rechazarReserva(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/verificar-pago", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CONFIRMADA", await verificarPago(req.tiendaId, req.params.id, req.user)); } catch (error) { next(error); }
});

router.post("/:id/rechazar-pago", ...operacion, validate({ params: idParamSchema, body: rechazarPagoSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_PAGO_RECHAZADO", await rechazarPago(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/cancelar", ...operacion, validate({ params: idParamSchema, body: motivoSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CANCELADA", await cancelarPorNegocio(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

// ---------- Locales: plan de pagos (R7) ----------

// Edita el plan antes del primer pago (409 PLAN_BLOQUEADO después).
router.put("/:id/plan", ...operacion, validate({ params: idParamSchema, body: planPagosSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_PLAN_ACTUALIZADO", await editarPlan(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

// La primera cuota verificada confirma la reserva.
router.post("/:id/cuotas/:cuotaId/verificar", ...operacion, validate({ params: cuotaAdminParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CUOTA_VERIFICADA", await verificarCuota(req.tiendaId, req.params.id, req.params.cuotaId, req.user)); } catch (error) { next(error); }
});

router.post("/:id/cuotas/:cuotaId/rechazar", ...operacion, validate({ params: cuotaAdminParamSchema, body: rechazarPagoSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CUOTA_RECHAZADA", await rechazarCuota(req.tiendaId, req.params.id, req.params.cuotaId, req.body, req.user)); } catch (error) { next(error); }
});

// Reenvía al cliente el correo de su estado actual (CE-13).
router.post("/:id/reenviar-correo", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CORREO_REENVIADO", await reenviarCorreo(req.tiendaId, req.params.id)); } catch (error) { next(error); }
});

router.post("/:id/no-show", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_NO_SHOW", await marcarNoShow(req.tiendaId, req.params.id, req.user)); } catch (error) { next(error); }
});

// ---------- Hotel: ciclo de la reserva en recepción (docs/specs/ciclo-reserva-hotel) ----------

router.post("/:id/check-in", ...operacion, validate({ params: idParamSchema, body: checkinSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CHECKIN", await registrarCheckin(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/check-out", ...operacion, validate({ params: idParamSchema, body: checkoutSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CHECKOUT", await registrarCheckout(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.put("/:id/codigo-pms", ...operacion, validate({ params: idParamSchema, body: codigoPmsSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CODIGO_PMS", await guardarCodigoPms(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.put("/:id/estadia", ...operacion, validate({ params: idParamSchema, body: modificarSchema }), async (req, res, next) => {
  try {
    const { tiendaId, ...cambios } = req.body;
    return ok(res, "RESERVA_MODIFICADA", await modificarReserva(req.tiendaId, req.params.id, cambios, req.user));
  } catch (error) { next(error); }
});

router.post("/:id/cambiar-salida", ...operacion, validate({ params: idParamSchema, body: cambiarSalidaSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_SALIDA_CAMBIADA", await cambiarSalida(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/cancelar-hotel", ...operacion, validate({ params: idParamSchema, body: cancelarHotelSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_CANCELADA", await cancelarHotel(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/horario", ...operacion, validate({ params: idParamSchema, body: responderHorarioSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_HORARIO_RESPONDIDO", await responderHorario(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/salida-tardia", ...operacion, validate({ params: idParamSchema, body: salidaTardiaSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_SALIDA_TARDIA", await darSalidaTardia(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

router.post("/:id/no-llego", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_NO_SHOW", await marcarNoLlego(req.tiendaId, req.params.id, req.user)); } catch (error) { next(error); }
});

router.post("/:id/notas", ...operacion, validate({ params: idParamSchema, body: notaSchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_NOTA", await agregarNota(req.tiendaId, req.params.id, req.body, req.user)); } catch (error) { next(error); }
});

export default router;
