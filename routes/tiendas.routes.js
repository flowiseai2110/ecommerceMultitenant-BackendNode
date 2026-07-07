import { Router } from "express";
import GenericController from "../controllers/generic.controller.js";
import GenericService from "../services/generic.service.js";
import GenericRepository from "../repositories/generic.repository.js";
import { prisma } from "../config/prisma.js";
import { validate } from "../middlewares/validation.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireTiendaAccess, resolveTiendaId } from "../middlewares/tienda-access.middleware.js";
import { apiResponse } from "../utils/apiResponse.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import { uploadLogo, uploadBanner } from "../controllers/tiendas-imagen.controller.js";
import MemoryCache from "../utils/memory-cache.js";
import { invalidateTiendasStoreCache } from "./store/tiendas.routes.js";
import { seedMetodosPagoParaTienda } from "../services/metodos-pago-seed.service.js";
import { seedMetodosEnvioParaTienda } from "../services/metodos-envio-seed.service.js";
import { getDiseno, saveDiseno } from "../services/tienda-diseno.service.js";
import { logger } from "../config/logger.js";
import {
  createTiendaSchema,
  updateTiendaSchema,
  idParamSchema,
  tiendaIdParamSchema,
  paginationSchema
} from "../validators/tiendas.validator.js";
import { updateDisenoSchema } from "../validators/tienda-diseno.validator.js";

// Crear instancias de las capas
const tiendasRepository = new GenericRepository(prisma.tiendas, "Tiendas");
const tiendaService = new GenericService(tiendasRepository, { enableAudit: true });
const tiendasController = new GenericController(tiendaService, "Tiendas");

// La tienda es su propio recurso raíz: su "tiendaId" para fines de acceso
// es su propio id. Mapeamos params.id → params.tiendaId para que
// requireTiendaAccess pueda validar la membresía del usuario.
const resolveTiendaIdFromId = resolveTiendaId(async (req) => req.params.id);

// Campos que la tabla de administración (tienda-list) realmente renderiza:
// id (key), nombre + slug (columna Nombre), ruc, email, tipoNegocio, activo.
// El detalle completo se obtiene aparte vía GET /:id al editar.
const TIENDAS_LIST_ALLOWED_FIELDS = ["id", "nombre", "slug", "ruc", "email", "tipoNegocio", "activo"];

// Campos donde el buscador del admin debe coincidir (ver placeholder en
// tienda-list.component.html: "Buscar por nombre, slug, RUC, razon social o email")
const TIENDAS_SEARCH_FIELDS = ["nombre", "slug", "ruc", "razonSocial", "email"];

// Construye el "select" de Prisma para el listado: por defecto, solo lo que
// usa la tabla; si llega ?fields=, se filtra contra el whitelist (deny by default).
function buildTiendasListSelect(fields) {
  const requested = fields
    ? String(fields).split(",").map(f => f.trim()).filter(Boolean)
    : TIENDAS_LIST_ALLOWED_FIELDS;

  const allowed = requested.filter(f => TIENDAS_LIST_ALLOWED_FIELDS.includes(f));
  const select = { id: true };
  for (const field of allowed) {
    select[field] = true;
  }
  return select;
}

// Cache temporal del listado (60s): el resultado depende de la membresía del
// usuario, así que la key incluye su id además de los parámetros de la query.
const TIENDAS_LIST_CACHE_TTL_MS = 60_000;
const tiendasListCache = new MemoryCache();

function buildTiendasListCacheKey(userId, query, page, limit) {
  return [userId, page, limit, query.search || "", query.fields || ""].join("|");
}

// Invalida la cache del listado admin Y la cache pública del storefront tras
// cualquier escritura exitosa (create/update/delete/logo/banner). Se limpian
// por completo en vez de por key puntual: son tablas pequeñas y así no hay
// riesgo de dejar combinaciones de búsqueda/fields/slug obsoletas.
function invalidateTiendasListCache(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      tiendasListCache.clear();
      invalidateTiendasStoreCache();
    }
  });
  next();
}

const router = Router();

// GET / - Listar SOLO las tiendas a las que el usuario pertenece
// (antes devolvía todas las tiendas de la plataforma a cualquier usuario autenticado)
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
      const cached = tiendasListCache.get(cacheKey);
      if (cached) {
        return apiResponse(res, cached);
      }

      const membresias = await prisma.usuario_tiendas.findMany({
        where: { userId: req.user.id, activo: true },
        select: { tiendaId: true }
      });
      const tiendaIds = membresias.map(m => m.tiendaId);

      const where = {
        id: { in: tiendaIds },
        ...(query.search ? {
          OR: TIENDAS_SEARCH_FIELDS.map(field => ({
            [field]: { contains: query.search, mode: "insensitive" }
          }))
        } : {})
      };
      const select = buildTiendasListSelect(query.fields);
      const [data, total] = await Promise.all([
        prisma.tiendas.findMany({
          where,
          select,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { fechaRegistro: "desc" }
        }),
        prisma.tiendas.count({ where })
      ]);

      const responsePayload = {
        status: 200, type: "SUCCESS", code: "TIENDAS_LIST", data,
        meta: {
          total, page, limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      };
      tiendasListCache.set(cacheKey, responsePayload, TIENDAS_LIST_CACHE_TTL_MS);

      return apiResponse(res, responsePayload);
    } catch (error) {
      next(error);
    }
  }
);

// GET - Stats de una tienda (4 COUNTs + 1 aggregate en paralelo)
router.get(
  "/:tiendaId/stats",
  authMiddleware,
  requireTiendaAccess("viewer"),
  validate({ params: tiendaIdParamSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId } = req.params;

      const [
        categorias,
        productos,
        pedidosTotal,
        pedidosPendientes,
        clientes,
        miembros,
        ventas
      ] = await Promise.all([
        prisma.categorias.count({ where: { tiendaId } }),
        prisma.productos.count({ where: { tiendaId, activo: true } }),
        prisma.pedidos.count({ where: { tiendaId } }),
        prisma.pedidos.count({ where: { tiendaId, estado: "pendiente" } }),
        prisma.clientes.count({ where: { tiendaId } }),
        prisma.usuario_tiendas.count({ where: { tiendaId, activo: true } }),
        prisma.pedidos.aggregate({
          where: { tiendaId },
          _sum: { total: true }
        })
      ]);

      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDA_STATS",
        data: {
          categorias,
          productos,
          pedidos: {
            total: pedidosTotal,
            pendientes: pedidosPendientes
          },
          clientes,
          miembros,
          ventasTotal: ventas._sum.total ?? 0
        }
      });
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

router.post(
  "/",
  authMiddleware,
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

      return apiResponse(res, {
        status: 201,
        type: "SUCCESS",
        code: "TIENDAS_CREATED",
        data: record
      });
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
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDAS_UPDATED",
        data: record
      });
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
      const diseno = await getDiseno(req.params.id);
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDA_DISENO",
        data: diseno
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /:id/diseno — Guardar personalización visual (upsert por clave).
// Invalida las caches de tiendas porque el diseño viaja embebido en la
// respuesta pública de GET /store/tiendas?slug=.
router.put(
  "/:id/diseno",
  authMiddleware,
  validate({ params: idParamSchema, body: updateDisenoSchema }),
  resolveTiendaIdFromId,
  requireTiendaAccess("admin"),
  invalidateTiendasListCache,
  async (req, res, next) => {
    try {
      const diseno = await saveDiseno(req.params.id, req.body, req.user);
      return apiResponse(res, {
        status: 200,
        type: "SUCCESS",
        code: "TIENDA_DISENO_UPDATED",
        data: diseno
      });
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
