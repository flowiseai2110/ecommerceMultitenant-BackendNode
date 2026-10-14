import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { idParamSchema, paginationSchema } from "./tiendas.schema.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { disenoPublico } from "../campanas/resolver.js";
import { getTiendasStore, setTiendasStore } from "./tiendas.cache.js";
import { localizar } from "../traducciones/localizar.js";
import { FUENTES } from "../traducciones/fuentes.js";
import { elegirIdioma, idiomasVisibles } from "../idiomas/idiomas-tienda.js";
import { getComunicadosPublicos } from "../comunicados/comunicados.service.js";

const tiendasRepository = new GenericRepository(prisma.tiendas, "Tienda");
const tiendasService = new GenericService(tiendasRepository, {
  searchFields: ["nombre", "slug"]
});
const tiendasController = new GenericController(tiendasService, "Tienda");

const router = Router();

// GET / - Listar tiendas (público — para lookup por slug)
router.get("/", validate({ query: paginationSchema }), async (req, res, next) => {
  try {
    const { lang, ...query } = req.validatedQuery || req.query;
    // La tienda aún no se conoce (se busca por slug): el idioma se elige
    // abajo con los suyos; la caché separa por el ?lang= pedido.
    const cacheKey = JSON.stringify({ ...query, lang: lang ?? null });

    const cached = getTiendasStore(cacheKey);
    if (cached) {
      return apiResponse(res, cached);
    }

    const { data, meta } = await tiendasService.findAll(query);

    // Cuando el storefront resuelve una tienda puntual por slug, se adjunta
    // su personalización visual (barra de anuncios, hero) para evitar un
    // segundo request público. La invalidación llega vía
    // invalidateTiendasStoreCache() al guardar el diseño en el admin.
    if (query.slug && data.length === 1) {
      // Sin la lista de campañas (nunca se publican las futuras) y con la
      // vigente ya resuelta en hora de Lima. La caché de 60 s hace que un
      // cambio de campaña tarde como máximo un minuto en verse (R3.4).
      const diseno = await getDiseno(data[0].id);
      data[0].diseno = disenoPublico(diseno, new Date(), data[0].tipoNegocio);
      // Comunicados vigentes, ya resueltos en hora de Lima (docs/specs/comunicados R2.1).
      data[0].comunicados = await getComunicadosPublicos(data[0].id);
      // Idiomas del selector y textos del diseño en el idioma pedido (docs/specs/idiomas D2, D5).
      const visibles = await idiomasVisibles(data[0].id);
      const idioma = await elegirIdioma(visibles, lang);
      const local = localizar(FUENTES.diseno, {
        estructura: data[0].diseno.tema.estructura, descripcion: data[0].descripcion, traducciones: diseno.traducciones
      }, idioma);
      data[0].diseno.tema.estructura = local.estructura;
      data[0].descripcion = local.descripcion;
      data[0].idiomas = visibles.map((i) => i.codigo);
      // Para el selector: cada idioma con su nombre en su propia lengua y su formato.
      data[0].idiomasDisponibles = visibles.map(({ codigo, nombre, locale, esBase }) => ({ codigo, nombre, locale, esBase }));
    }

    const responsePayload = { status: 200, type: "SUCCESS", code: "TIENDA_LIST", data, meta };
    setTiendasStore(cacheKey, responsePayload);

    return apiResponse(res, responsePayload);
  } catch (error) {
    next(error);
  }
});

// GET /:id - Obtener tienda por ID (público)
router.get("/:id", validate({ params: idParamSchema }), tiendasController.findById);

export default router;
