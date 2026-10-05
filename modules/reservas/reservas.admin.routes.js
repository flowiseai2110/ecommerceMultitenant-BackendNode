import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { guardarConfig, obtenerConfig } from "./reservas.config.service.js";
import { crearCierre, eliminarCierre, listarCierres } from "./cierres.service.js";
import { guardarFicha, listarHabitacionesAdmin, obtenerFichaAdmin } from "./hotel/habitaciones.service.js";
import { guardarFichaTour, listarToursAdmin, obtenerFichaTourAdmin } from "./tours/tours.service.js";
import { asistentesFuncion, guardarFichaEvento, listarEventosAdmin, obtenerFichaEventoAdmin } from "./eventos/eventos.service.js";
import {
  aceptarReserva, agendaReservas, cancelarPorNegocio, detalleReservaAdmin, listarReservasAdmin, marcarNoShow,
  rechazarPago, rechazarReserva, resumenReservas, verificarPago
} from "./reservas.service.js";
import {
  aceptarSchema, agendaQuerySchema, configSchema, crearCierreSchema, habitacionSchema, idParamSchema,
  listarAdminQuerySchema, motivoSchema, productoParamSchema, rechazarPagoSchema, rechazarSchema, tiendaQuerySchema, tourSchema,
  eventoSchema, funcionParamSchema
} from "./reservas.schema.js";

/**
 * Mini booking — panel del negocio (docs/specs/mini-booking).
 *
 * Roles: ver, cualquier miembro (viewer+). Responder solicitudes y verificar
 * pagos, editor+ (en un hostal pequeño el recepcionista suele ser editor).
 * Configuración, habitaciones, tours, eventos y fechas cerradas, admin+.
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

// Lista de asistentes de una función (control de ingreso; reemplaza a las entradas con QR).
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

// ---------- Bandeja ----------

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

router.post("/:id/no-show", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res, next) => {
  try { return ok(res, "RESERVA_NO_SHOW", await marcarNoShow(req.tiendaId, req.params.id, req.user)); } catch (error) { next(error); }
});

export default router;
