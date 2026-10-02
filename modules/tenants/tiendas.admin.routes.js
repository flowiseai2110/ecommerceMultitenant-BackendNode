import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { authMiddleware, requireAnyMembership, requireTiendaAccess, resolveTiendaId } from "../../kernel/tenant/index.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { uploadImage } from "../../middlewares/upload.middleware.js";
import { uploadLogo, uploadBanner } from "../../controllers/tiendas-imagen.controller.js";
import { seedMetodosPagoParaTienda } from "../../services/metodos-pago-seed.service.js";
import { seedMetodosEnvioParaTienda } from "../../services/metodos-envio-seed.service.js";
import { disenoAdmin, saveDiseno } from "../../services/tienda-diseno.service.js";
import { aplicarPlantilla, deshacerEstructura, getDisenoAdmin } from "../diseno/diseno.service.js";
import { aplicarPlantillaSchema } from "../diseno/secciones.schema.js";
import { getPlantillasWhatsapp, savePlantillasWhatsapp } from "../../services/tienda-plantillas-whatsapp.service.js";
import { logger } from "../../config/logger.js";
import {
  createTiendaSchema,
  updateTiendaSchema,
  idParamSchema,
  tiendaIdParamSchema,
  paginationSchema
} from "./tiendas.schema.js";
import { updateDisenoSchema } from "../../validators/tienda-diseno.validator.js";
import { calendarioQuerySchema, vistaPreviaQuerySchema } from "../campanas/campanas.schema.js";
import { getCalendario, getVistaPrevia } from "../campanas/campanas.service.js";
import { updatePlantillasWhatsappSchema } from "../../validators/tienda-plantillas-whatsapp.validator.js";
import { listTiendasForUser, getTiendaStats } from "./tiendas.service.js";
import {
  getTiendasAdminList,
  setTiendasAdminList,
  invalidateTiendasCaches
} from "./tiendas.cache.js";

// Crear instancias de las capas
const tiendasRepository = new GenericRepository(prisma.tiendas, "Tiendas");
const tiendaService = new GenericService(tiendasRepository, { enableAudit: true });
const tiendasController = new GenericController(tiendaService, "Tiendas");

// La tienda es su propio recurso raíz: su "tiendaId" para fines de acceso
// es su propio id. Mapeamos params.id → params.tiendaId para que
// requireTiendaAccess pueda validar la membresía del usuario.
const resolveTiendaIdFromId = resolveTiendaId(async (req) => req.params.id);

function buildTiendasListCacheKey(userId, query, page, limit) {
  return [userId, page, limit, query.search || "", query.fields || ""].join("|");
}

// Invalida la cache del listado admin Y la cache pública del storefront tras
// cualquier escritura exitosa (create/update/delete/logo/banner/diseño).
function invalidateTiendasListCache(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      invalidateTiendasCaches();
    }
  });
  next();
}

const router = Router();

// GET / - Listar SOLO las tiendas a las que el usuario pertenece
router.get(
  "/",
  authMiddleware,
  validate({ query: paginationSchema }),
  async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 100);

      const cacheKey = buildTiendasListCacheKey(req.user.id, query, page, limit);
      const cached = getTiendasAdminList(cacheKey);
      if (cached) {
        return apiResponse(res, cached);
      }

      const { data, meta } = await listTiendasForUser(req.user.id, query);

      const responsePayload = { status: 200, type: "SUCCESS", code: "TIENDAS_LIST", data, meta };
      setTiendasAdminList(cacheKey, responsePayload);

      return apiResponse(res, responsePayload);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:tiendaId/stats - Estadísticas agregadas del dashboard
router.get(
  "/:tiendaId/stats",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: tiendaIdParamSchema }),
  async (req, res, next) => {
    try {
      const data = await getTiendaStats(req.params.tiendaId);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_STATS", data });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("viewer"),
  tiendasController.findById
);

// Solo miembros de alguna tienda (comerciantes invitados). Un comprador del
// storefront también tiene JWT de Supabase y no debe poder crear tiendas.
router.post(
  "/",
  authMiddleware,
  requireAnyMembership(),
  validate({ body: createTiendaSchema }),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const record = await tiendaService.create(req.body, req.user);

      // Precargar métodos de pago sugeridos para que el dueño solo los
      // active/complete. Un fallo aquí no debe deshacer la tienda creada.
      try {
        await seedMetodosPagoParaTienda(record.id);
      } catch (error) {
        logger.error(`No se pudieron precargar los métodos de pago de la tienda ${record.id}:`, error);
      }

      // Precargar métodos de envío sugeridos (Recojo en tienda activo,
      // couriers desactivados hasta que el dueño confirme que trabaja con ellos).
      try {
        await seedMetodosEnvioParaTienda(record.id);
      } catch (error) {
        logger.error(`No se pudieron precargar los métodos de envío de la tienda ${record.id}:`, error);
      }

      return apiResponse(res, { status: 201, type: "SUCCESS", code: "TIENDAS_CREATED", data: record });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema, body: updateTiendaSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      // tiendas es la raíz del tenant: no tiene campo tiendaId propio.
      // requireTiendaAccess ya verificó el acceso, así que no se pasa tiendaId.
      const record = await tiendaService.update(id, req.body, req.user, null);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDAS_UPDATED", data: record });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/diseno — Personalización visual del storefront (anuncio, hero)
router.get(
  "/:id/diseno",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("viewer"),
  async (req, res, next) => {
    try {
      const diseno = await getDisenoAdmin(req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_DISENO", data: diseno });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /:id/diseno — Guardar personalización visual (upsert por clave).
router.put(
  "/:id/diseno",
  authMiddleware,
  validate({ params: idParamSchema, body: updateDisenoSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const diseno = disenoAdmin(await saveDiseno(req.params.id, req.body, req.user));
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_DISENO_UPDATED", data: diseno });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/diseno/estructura/aplicar — Copia una plantilla como estructura
// de la tienda (docs/specs/estructura-tienda, R2.2/R3) o la restaura (R4.5).
// La estructura previa queda para "Deshacer".
router.post(
  "/:id/diseno/estructura/aplicar",
  authMiddleware,
  validate({ params: idParamSchema, body: aplicarPlantillaSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const diseno = await aplicarPlantilla(req.params.id, req.body.plantillaId, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_DISENO_UPDATED", data: diseno });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/diseno/estructura/deshacer — Vuelve a la estructura previa a la
// última plantilla aplicada (R3.6).
router.post(
  "/:id/diseno/estructura/deshacer",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const diseno = await deshacerEstructura(req.params.id, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_DISENO_UPDATED", data: diseno });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/campanas/calendario?anio= — Campañas del año: ventana de cada
// preset, si está activa y si se sugiere por el rubro (docs/specs/campanas-widgets).
router.get(
  "/:id/campanas/calendario",
  authMiddleware,
  validate({ params: idParamSchema, query: calendarioQuerySchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("viewer"),
  async (req, res, next) => {
    try {
      const data = await getCalendario(req.params.id, req.validatedQuery.anio);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_CAMPANAS_CALENDARIO", data });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/diseno/vista-previa?fecha=YYYY-MM-DD — El diseño como lo vería el
// storefront ese día (con su campaña resuelta). Solo admin: el endpoint
// público nunca acepta fechas simuladas.
router.get(
  "/:id/diseno/vista-previa",
  authMiddleware,
  validate({ params: idParamSchema, query: vistaPreviaQuerySchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("editor"),
  async (req, res, next) => {
    try {
      const data = await getVistaPrevia(req.params.id, req.validatedQuery.fecha);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_DISENO_VISTA_PREVIA", data });
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/plantillas-whatsapp — Plantillas de mensajes al cliente
router.get(
  "/:id/plantillas-whatsapp",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("viewer"),
  async (req, res, next) => {
    try {
      const plantillas = await getPlantillasWhatsapp(req.params.id);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_PLANTILLAS_WHATSAPP", data: plantillas });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /:id/plantillas-whatsapp — Guardar plantillas (upsert de una sola fila).
router.put(
  "/:id/plantillas-whatsapp",
  authMiddleware,
  validate({ params: idParamSchema, body: updatePlantillasWhatsappSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  async (req, res, next) => {
    try {
      const plantillas = await savePlantillasWhatsapp(req.params.id, req.body, req.user);
      return apiResponse(res, { status: 200, type: "SUCCESS", code: "TIENDA_PLANTILLAS_WHATSAPP_UPDATED", data: plantillas });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/logo — Subir o reemplazar logo de la tienda (400×400, inside)
router.post(
  "/:id/logo",
  authMiddleware,
  validate({ params: idParamSchema }),
  uploadImage.single("file"),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  uploadLogo
);

// POST /:id/banner — Subir o reemplazar banner de la tienda (1200×400, cover)
router.post(
  "/:id/banner",
  authMiddleware,
  validate({ params: idParamSchema }),
  uploadImage.single("file"),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  uploadBanner
);

router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("owner"),
  invalidateTiendasListCache,
  tiendasController.delete
);

export default router;
