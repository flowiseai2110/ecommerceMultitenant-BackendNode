import { Router } from "express";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireTiendaAccess } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import {
  activar, agregarDestino, agregarInvitados, anularInvitacion, borrarGrabacionAhora, cancelar, crearVinculacion, datosConexion, editar, extender,
  guardarAnio, horasTienda, iniciarPrueba, listarTransmisiones, obtenerPorFuncion, pedirResumen, quitarDestino, regenerarClave, regenerarInvitacion,
  terminar, terminarALaHora
} from "./transmisiones.service.js";
import {
  activarSchema, destinoParamSchema, destinoSchema, editarSchema, extenderSchema, funcionParamSchema, idParamSchema, invitacionParamSchema, invitadosSchema,
  tiendaQuerySchema
} from "./transmisiones.schema.js";

/**
 * Transmisión de eventos — panel del negocio (docs/specs/transmision-eventos).
 *
 * Roles (R1.1, R5.1): ver, cualquier miembro (viewer+). Activar, editar,
 * cancelar, invitar, transmitir y ver los datos de conexión (secretos), editor+.
 * El tiendaId efectivo SIEMPRE es req.tiendaId (validado
 * contra la membresía por requireTiendaAccess), nunca uno arbitrario del body.
 */

const router = Router();
const ok = (res, code, data) => apiResponse(res, { status: 200, type: "SUCCESS", code, data });

const lectura = [authMiddleware, requireTiendaAccess("viewer")];
const gestion = [authMiddleware, requireTiendaAccess("editor")];

router.get("/", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISIONES", await listarTransmisiones(req.tiendaId));
});

// Horas de la tienda este mes: plan, paquetes, excedente (Fase 3).
router.get("/horas", ...lectura, validate({ query: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_HORAS", await horasTienda(req.tiendaId));
});

router.get("/funciones/:funcionId", ...lectura, validate({ params: funcionParamSchema, query: tiendaQuerySchema }),
  async (req, res) => {
    return ok(res, "TRANSMISION_FUNCION", await obtenerPorFuncion(req.tiendaId, req.params.funcionId));
  });

router.post("/funciones/:funcionId", ...gestion, validate({ params: funcionParamSchema, body: activarSchema }),
  async (req, res) => {
    const { tiendaId, consentimiento, ...data } = req.body;
    return ok(res, "TRANSMISION_ACTIVADA", await activar(req.tiendaId, req.params.funcionId, data, req.user));
  });

router.put("/:id", ...gestion, validate({ params: idParamSchema, body: editarSchema }), async (req, res) => {
  const { tiendaId, ...data } = req.body;
  return ok(res, "TRANSMISION_ACTUALIZADA", await editar(req.tiendaId, req.params.id, data, req.user));
});

router.post("/:id/cancelar", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_CANCELADA", await cancelar(req.tiendaId, req.params.id, req.user));
});

router.post("/:id/invitaciones", ...gestion, validate({ params: idParamSchema, body: invitadosSchema }), async (req, res) => {
  return ok(res, "INVITACIONES_AGREGADAS", await agregarInvitados(req.tiendaId, req.params.id, req.body.invitados, req.user));
});

router.post("/:id/invitaciones/:invitacionId/anular", ...gestion, validate({ params: invitacionParamSchema, body: tiendaQuerySchema }),
  async (req, res) => {
    return ok(res, "INVITACION_ANULADA", await anularInvitacion(req.tiendaId, req.params.id, req.params.invitacionId, req.user));
  });

router.post("/:id/invitaciones/:invitacionId/regenerar", ...gestion, validate({ params: invitacionParamSchema, body: tiendaQuerySchema }),
  async (req, res) => {
    return ok(res, "INVITACION_REGENERADA", await regenerarInvitacion(req.tiendaId, req.params.id, req.params.invitacionId, req.user));
  });

// ---------- Plan Privado (Fase 2) ----------

router.get("/:id/conexion", ...gestion, validate({ params: idParamSchema, query: tiendaQuerySchema }), async (req, res) => {
  res.set("Cache-Control", "no-store");
  return ok(res, "TRANSMISION_CONEXION", await datosConexion(req.tiendaId, req.params.id));
});

router.post("/:id/regenerar-clave", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_CLAVE_REGENERADA", await regenerarClave(req.tiendaId, req.params.id, req.user));
});

router.post("/:id/prueba", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_PRUEBA", await iniciarPrueba(req.tiendaId, req.params.id, req.user));
});

router.post("/:id/terminar", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_TERMINADA", await terminar(req.tiendaId, req.params.id, req.user));
});

// ---------- Extensión y excedente (Fase 3) ----------

router.post("/:id/extender", ...gestion, validate({ params: idParamSchema, body: extenderSchema }), async (req, res) => {
  return ok(res, "TRANSMISION_EXTENDIDA", await extender(req.tiendaId, req.params.id, req.body.minutos, req.user));
});

router.post("/:id/terminar-a-la-hora", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_SIN_EXTENSION", await terminarALaHora(req.tiendaId, req.params.id, req.user));
});

// ---------- Grabación (Fase 4) ----------

// "Guardar 1 año" (S/ 50, cargo manual a la tienda).
router.post("/:id/guardar-anio", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_GRABACION_GUARDADA", await guardarAnio(req.tiendaId, req.params.id, req.user));
});

// R9.3: borrar la grabación antes de su plazo, a pedido del anfitrión. admin+: no se puede deshacer.
router.post("/:id/borrar-grabacion", authMiddleware, requireTiendaAccess("admin"), validate({ params: idParamSchema, body: tiendaQuerySchema }),
  async (req, res) => {
    return ok(res, "TRANSMISION_GRABACION_BORRADA", await borrarGrabacionAhora(req.tiendaId, req.params.id, req.user));
  });

// ---------- Retransmisión a Facebook y YouTube (Premium, Fase 5) ----------

router.post("/:id/destinos", ...gestion, validate({ params: idParamSchema, body: destinoSchema }), async (req, res) => {
  const { tiendaId, ...destino } = req.body;
  return ok(res, "TRANSMISION_DESTINO_AGREGADO", await agregarDestino(req.tiendaId, req.params.id, destino, req.user));
});

// R8.3: "Generar resumen" con IA. Nunca corre solo (decisión 2026-10-15).
router.post("/:id/resumen", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_RESUMEN_PEDIDO", await pedirResumen(req.tiendaId, req.params.id, req.user));
});

router.delete("/:id/destinos/:destinoId", ...gestion, validate({ params: destinoParamSchema, query: tiendaQuerySchema }), async (req, res) => {
  return ok(res, "TRANSMISION_DESTINO_QUITADO", await quitarDestino(req.tiendaId, req.params.id, req.params.destinoId, req.user));
});

// QR "Transmitir con este celular" (App Transmitir, R11.1).
router.post("/:id/vinculaciones", ...gestion, validate({ params: idParamSchema, body: tiendaQuerySchema }), async (req, res) => {
  res.set("Cache-Control", "no-store");
  return ok(res, "TRANSMISION_VINCULACION", await crearVinculacion(req.tiendaId, req.params.id, req.user));
});

export default router;
