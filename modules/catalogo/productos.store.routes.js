import { Router } from "express";
import { facetasOpciones, whereOpciones } from "./filtro-opciones.js";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { idParamSchema, paginationSchema, homeQuerySchema } from "./productos.schema.js";
import { NotFoundError } from "../../utils/errors.js";
import { conPrecioSql, CON_PRECIO_WHERE } from "./productos.vitrina.js";
import {
  serializeProductoCardStore,
  serializeProductoDetailStore
} from "./productos.serializer.js";
import {
  getProductosHome,
  setProductosHome,
  getProductoDetail,
  setProductoDetail
} from "./productos.cache.js";

// Proyección de campos para listados públicos
const productosListSelect = {
  id: true,
  tiendaId: true,
  categoriaId: true,
  marcaId: true,
  marca: { select: { id: true, nombre: true, slug: true, logoUrl: true } },
  nombre: true,
  slug: true,
  descripcionCorta: true,
  sku: true,
  precioBase: true,
  precioOferta: true,
  stock: true,
  activo: true,
  destacado: true,
  esServicio: true,
  etiquetas: true,
  ratingPromedio: true,
  ratingCantidad: true,
  imagenes: {
    where: { esPrincipal: true },
    take: 1,
    select: { id: true, url: true, textoAlternativo: true }
  }
};

const productosRepository = new GenericRepository(prisma.productos, "Producto");
const productosService = new GenericService(productosRepository, {
  include: {
    variantes: {
      where: { activo: true },
      select: { id: true, nombre: true, sku: true, precio: true, stock: true, atributos: true, activo: true }
    },
    imagenes: {
      orderBy: { orden: "asc" },
      select: { id: true, url: true, textoAlternativo: true, orden: true, esPrincipal: true }
    }
  },
  searchFields: ["nombre", "descripcion", "descripcionCorta", "slug", "sku"],
  listSelect: productosListSelect,
  // Read-policy store: sin tiendaId (subdominio o ?tiendaId=) no se lista nada.
  requireTiendaId: true,
  allowedFilters: ["activo", "categoriaId", "marcaId", "destacado", "esServicio"],
  // El producto de un evento privado (cumpleaños, boda) no se lista ni se busca
  // (docs/specs/transmision-eventos, R1.4). Tampoco uno sin precio todavía (productos.vitrina.js).
  baseWhere: {
    AND: [
      { NOT: { evento: { is: { privado: true } } } },
      CON_PRECIO_WHERE
    ]
  },
  // El storefront permite marcar varias categorias o marcas a la vez (?categoriaId=a,b&marcaId=c,d)
  multiValueFilters: ["categoriaId", "marcaId"],
  // ?opcion=Talla:M,Color:Negro (plantillas-por-rubro E9): variantes con stock que cumplan.
  customFilters: { opcion: whereOpciones },
  allowedOrderBy: ["precioBase", "nombre", "fechaRegistro", "stock", "ratingScore"],
  // "Mejor valorados" (?orderBy=ratingScore:desc): ratingScore es un promedio
  // bayesiano (ver resenas.service). A igual puntaje gana el de más reseñas, e
  // id cierra el orden para que la paginación sea estable: la mayoría de
  // productos empata en 0 y sin desempate las páginas repetirían o saltarían filas.
  // Los demás órdenes también empatan (mismo precio, misma fecha de carga
  // masiva, mismo stock): id los vuelve deterministas para el scroll infinito.
  orderByTiebreakers: {
    ratingScore: [{ ratingCantidad: "desc" }, { id: "asc" }],
    precioBase: [{ id: "asc" }],
    nombre: [{ id: "asc" }],
    fechaRegistro: [{ id: "asc" }],
    stock: [{ id: "asc" }]
  }
});
// El serializer del store define el contrato de salida campo por campo: nunca
// expone precioCosto, stockAlerta, metadata ni auditoría al público.
const productosController = new GenericController(productosService, "Producto", {
  serialize: serializeProductoCardStore
});

const router = Router();

// GET / - Listar productos (público — filtra por la tienda del subdominio,
// o por ?tiendaId=&activo=true&categoriaId= como fallback en dev/dominio genérico)
router.get("/", validate({ query: paginationSchema }), scopeQueryToTienda, productosController.findAll);

// GET /opciones?tiendaId=&categoriaId=a,b - Facetas de talla, color… para el panel de filtros (plantillas-por-rubro E9).
// Debe ir ANTES de /:id.
router.get("/opciones", validate({ query: paginationSchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const q = req.validatedQuery || req.query;
    const categorias = String(q.categoriaId ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const data = await facetasOpciones(q.tiendaId, categorias);
    res.set("Cache-Control", "public, max-age=60");
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "PRODUCTOS_OPCIONES", data });
  } catch (error) {
    next(error);
  }
});

// GET /home - Destacados + recientes en una sola llamada (público, para el home del storefront).
// Sin count() — el home no pagina, solo necesita un top-N de cada lista.
// Debe ir ANTES de /:id para que "home" no se intente validar como UUID.
router.get("/home", validate({ query: homeQuerySchema }), async (req, res, next) => {
  try {
    const { tiendaId, limit } = req.validatedQuery || req.query;
    const take = Math.min(limit || 8, 20);

    const cacheKey = `${tiendaId}|${take}`;
    const cached = getProductosHome(cacheKey);
    if (cached) {
      return apiResponse(res, cached);
    }

    // Una sola query (UNION ALL + LATERAL JOIN para la imagen principal) en vez de
    // 2 findMany + 2 sub-queries de relación: con la latencia de red a Supabase
    // (~150-300ms por round-trip vía pgbouncer), cada round-trip evitado pesa.
    // Ver análisis de performance: 12 productos, ejecución en Postgres <1ms —
    // el costo real estaba en la cantidad de viajes de red, no en la query.
    const rows = await prisma.$queryRaw`
      (
        SELECT 'destacados' AS grupo, p.id, p.tienda_id AS "tiendaId", p.nombre, p.slug,
               p.descripcion_corta AS "descripcionCorta", p.sku, p.precio_base AS "precioBase",
               p.precio_oferta AS "precioOferta", p.stock, p.activo, p.destacado,
               p.es_servicio AS "esServicio", p.etiquetas,
               p.rating_promedio AS "ratingPromedio", p.rating_cantidad AS "ratingCantidad",
               p.marca_id AS "marcaId", m.nombre AS "marcaNombre", m.slug AS "marcaSlug", m.logo_url AS "marcaLogoUrl",
               img.id AS "imagenId", img.url AS "imagenUrl", img.texto_alternativo AS "imagenAlt"
        FROM productos p
        LEFT JOIN marcas m ON m.id = p.marca_id
        LEFT JOIN LATERAL (
          SELECT id, url, texto_alternativo
          FROM producto_imagenes
          WHERE producto_id = p.id AND es_principal = true
          LIMIT 1
        ) img ON true
        WHERE p.tienda_id = ${tiendaId}::uuid AND p.activo = true AND p.destacado = true
          AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.producto_id = p.id AND e.privado)
          AND ${conPrecioSql()}
        ORDER BY p.id DESC
        LIMIT ${take}
      )
      UNION ALL
      (
        SELECT 'recientes' AS grupo, p.id, p.tienda_id AS "tiendaId", p.nombre, p.slug,
               p.descripcion_corta AS "descripcionCorta", p.sku, p.precio_base AS "precioBase",
               p.precio_oferta AS "precioOferta", p.stock, p.activo, p.destacado,
               p.es_servicio AS "esServicio", p.etiquetas,
               p.rating_promedio AS "ratingPromedio", p.rating_cantidad AS "ratingCantidad",
               p.marca_id AS "marcaId", m.nombre AS "marcaNombre", m.slug AS "marcaSlug", m.logo_url AS "marcaLogoUrl",
               img.id AS "imagenId", img.url AS "imagenUrl", img.texto_alternativo AS "imagenAlt"
        FROM productos p
        LEFT JOIN marcas m ON m.id = p.marca_id
        LEFT JOIN LATERAL (
          SELECT id, url, texto_alternativo
          FROM producto_imagenes
          WHERE producto_id = p.id AND es_principal = true
          LIMIT 1
        ) img ON true
        WHERE p.tienda_id = ${tiendaId}::uuid AND p.activo = true
          AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.producto_id = p.id AND e.privado)
          AND ${conPrecioSql()}
        ORDER BY p.fecha_registro DESC
        LIMIT ${take}
      )
    `;

    const destacados = [];
    const recientes = [];
    for (const row of rows) {
      // La query aplana la imagen principal en columnas (imagenId/imagenUrl/...);
      // se rearma como array antes de pasar por el serializer de tarjeta.
      const producto = serializeProductoCardStore({
        ...row,
        marca: row.marcaId
          ? { id: row.marcaId, nombre: row.marcaNombre, slug: row.marcaSlug, logoUrl: row.marcaLogoUrl }
          : null,
        imagenes: row.imagenId
          ? [{ id: row.imagenId, url: row.imagenUrl, textoAlternativo: row.imagenAlt }]
          : []
      });
      (row.grupo === "destacados" ? destacados : recientes).push(producto);
    }

    const responsePayload = { status: 200, type: "SUCCESS", code: "PRODUCTO_HOME", data: { destacados, recientes } };
    setProductosHome(cacheKey, responsePayload);

    return apiResponse(res, responsePayload);
  } catch (error) {
    next(error);
  }
});

// GET /:id - Obtener producto con variantes e imágenes (público)
router.get("/:id", validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { id } = req.params;

    const cached = getProductoDetail(id);
    if (cached) {
      return apiResponse(res, cached);
    }

    const rows = await prisma.$queryRaw`
      SELECT p.id, p.tienda_id AS "tiendaId", p.categoria_id AS "categoriaId", p.marca_id AS "marcaId",
             CASE WHEN m.id IS NULL THEN NULL
                  ELSE json_build_object('id', m.id, 'nombre', m.nombre, 'slug', m.slug, 'logoUrl', m.logo_url) END AS marca,
             p.nombre, p.slug,
             p.descripcion, p.descripcion_corta AS "descripcionCorta", p.sku,
             p.precio_base AS "precioBase", p.precio_oferta AS "precioOferta",
             p.stock, p.activo, p.destacado, p.es_servicio AS "esServicio", p.etiquetas,
             p.rating_promedio AS "ratingPromedio", p.rating_cantidad AS "ratingCantidad",
             p.metadata->'opciones' AS opciones,
             p.metadata->'video' AS video,
             COALESCE(v.variantes, '[]'::json) AS variantes,
             COALESCE(i.imagenes, '[]'::json) AS imagenes
      FROM productos p
      LEFT JOIN marcas m ON m.id = p.marca_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', pv.id, 'nombre', pv.nombre, 'sku', pv.sku, 'precio', pv.precio,
          'stock', pv.stock, 'atributos', pv.atributos, 'activo', pv.activo
        )) AS variantes
        FROM producto_variantes pv
        WHERE pv.producto_id = p.id AND pv.activo = true
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', pi.id, 'url', pi.url, 'textoAlternativo', pi.texto_alternativo,
          'orden', pi.orden, 'esPrincipal', pi.es_principal, 'valorOpcion', pi.valor_opcion
        ) ORDER BY pi.orden ASC) AS imagenes
        FROM producto_imagenes pi
        WHERE pi.producto_id = p.id
      ) i ON true
      WHERE p.id = ${id}::uuid
        AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.producto_id = p.id AND e.privado)
        AND ${conPrecioSql()}
    `;

    if (!rows[0]) {
      throw new NotFoundError("Producto");
    }
    const producto = serializeProductoDetailStore(rows[0]);

    const responsePayload = { status: 200, type: "SUCCESS", code: "PRODUCTO_FOUND", data: producto };
    setProductoDetail(id, responsePayload);

    return apiResponse(res, responsePayload);
  } catch (error) {
    next(error);
  }
});

export default router;
