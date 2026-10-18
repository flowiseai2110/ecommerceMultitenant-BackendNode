import { Router } from "express";
import { validate } from "../../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../../kernel/tenant/index.js";
import { apiResponse } from "../../../utils/apiResponse.js";
import {
  actualizarHabitacion, anularEstadia, cambiarHabitacion, cobrarSaldo, crearHabitacion, eliminarHabitacion, extenderEstadia,
  generarHabitaciones, listarHabitaciones, marcarLimpia, registrarEntrada, registrarSalida, tablero,
  agregarConsumo, registrarLlegada
} from "./recepcion.service.js";
import {
  abrirTurno, cerrarTurno, detalleTurno, estadoCaja, listarIncidencias, listarTurnos, marcarIncidenciaRevisada,
  registrarMovimiento, reportarUsoSinRegistrar
} from "./caja.service.js";
import {
  anularSchema, cambiarSchema, cobrarSchema, entradaSchema, extenderSchema, habitacionCrearSchema, habitacionEditarSchema,
  idParamSchema, salidaSchema, tiendaQuerySchema,
  abrirCajaSchema, cerrarCajaSchema, movimientoSchema, usadaSchema, incidenciasQuerySchema, llegadaSchema, consumoSchema
} from "./recepcion.schema.js";

/**
 * Recepción (docs/specs/recepcion, fase 1). Montado en /admin/recepcion.
 *
 * Roles: ver el tablero, viewer+. Operar el mostrador y su caja (entrada,
 * extender, cobrar, salida, limpieza, abrir y cerrar caja), editor+. El rol
 * "recepcionista" (R6) entra solo aquí, a ver y operar. Habitaciones, anular,
 * reportes de caja e incidencias, admin+.
 */

const router = Router();
const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });
const ruta = (fn) => async (req, res) => { await fn(req, res); };

const RECEPCIONISTA = { tambien: ["recepcionista"] };
const lectura = [authMiddleware, requireTiendaAccess("viewer", RECEPCIONISTA)];
const operacion = [authMiddleware, requireTiendaAccess("editor", RECEPCIONISTA)];
const gestion = [authMiddleware, requireTiendaAccess("admin")];

const sinTienda = ({ tiendaId, ...resto }) => resto;

router.get("/tablero", ...lectura, validate({ query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_TABLERO", await tablero(req.tiendaId))));

// ---------- Habitaciones físicas ----------

router.get("/habitaciones", ...lectura, validate({ query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_HABITACIONES", await listarHabitaciones(req.tiendaId))));

router.post("/habitaciones/generar", ...gestion, validate({ body: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_HABITACIONES_GENERADAS", await generarHabitaciones(req.tiendaId, req.user))));

router.post("/habitaciones", ...gestion, validate({ body: habitacionCrearSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_HABITACION_CREADA", await crearHabitacion(req.tiendaId, sinTienda(req.body), req.user))));

router.put("/habitaciones/:id", ...gestion, validate({ params: idParamSchema, body: habitacionEditarSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_HABITACION_ACTUALIZADA", await actualizarHabitacion(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.delete("/habitaciones/:id", ...gestion, validate({ params: idParamSchema, query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_HABITACION_ELIMINADA", await eliminarHabitacion(req.tiendaId, req.params.id))));

router.post("/habitaciones/:id/limpia", ...operacion, validate({ params: idParamSchema, body: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_LIMPIA", await marcarLimpia(req.tiendaId, req.params.id, req.user))));

// ---------- Estadías ----------

router.post("/entradas", ...operacion, validate({ body: entradaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_ENTRADA", await registrarEntrada(req.tiendaId, sinTienda(req.body), req.user))));

router.post("/llegadas/:id", ...operacion, validate({ params: idParamSchema, body: llegadaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_LLEGADA", await registrarLlegada(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/consumos", ...operacion, validate({ params: idParamSchema, body: consumoSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CONSUMO", await agregarConsumo(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/extender", ...operacion, validate({ params: idParamSchema, body: extenderSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_EXTENDIDA", await extenderEstadia(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/cobrar", ...operacion, validate({ params: idParamSchema, body: cobrarSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_COBRADA", await cobrarSaldo(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/cambiar", ...operacion, validate({ params: idParamSchema, body: cambiarSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CAMBIADA", await cambiarHabitacion(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/salida", ...operacion, validate({ params: idParamSchema, body: salidaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_SALIDA", await registrarSalida(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.post("/estadias/:id/anular", ...gestion, validate({ params: idParamSchema, body: anularSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_ANULADA", await anularEstadia(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

// ---------- Caja (R5) ----------

router.get("/caja", ...operacion, validate({ query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CAJA", await estadoCaja(req.tiendaId, req.tiendaRol))));

router.post("/caja/abrir", ...operacion, validate({ body: abrirCajaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CAJA_ABIERTA", await abrirTurno(req.tiendaId, sinTienda(req.body), req.user))));

router.post("/caja/cerrar", ...operacion, validate({ body: cerrarCajaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CAJA_CERRADA", await cerrarTurno(req.tiendaId, sinTienda(req.body), req.user, req.tiendaRol))));

router.post("/caja/movimientos", ...operacion, validate({ body: movimientoSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_CAJA_MOVIMIENTO", await registrarMovimiento(req.tiendaId, sinTienda(req.body), req.user))));

router.get("/caja/turnos", ...gestion, validate({ query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_TURNOS", await listarTurnos(req.tiendaId))));

router.get("/caja/turnos/:id", ...gestion, validate({ params: idParamSchema, query: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_TURNO", await detalleTurno(req.tiendaId, req.params.id))));

// ---------- Incidencias (R5.5) ----------

router.post("/habitaciones/:id/usada", ...operacion, validate({ params: idParamSchema, body: usadaSchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_USO_SIN_REGISTRAR", await reportarUsoSinRegistrar(req.tiendaId, req.params.id, sinTienda(req.body), req.user))));

router.get("/incidencias", ...gestion, validate({ query: incidenciasQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_INCIDENCIAS", await listarIncidencias(req.tiendaId, { pendientes: req.validatedQuery.pendientes }))));

router.post("/incidencias/:id/revisada", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }),
  ruta(async (req, res) => ok(res, "RECEPCION_INCIDENCIA_REVISADA", await marcarIncidenciaRevisada(req.tiendaId, req.params.id, req.user))));

export default router;
