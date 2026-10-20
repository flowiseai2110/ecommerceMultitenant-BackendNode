import { Router } from "express";
import GenericController from "../../controllers/generic.controller.js";
import GenericService from "../../services/generic.service.js";
import GenericRepository from "../../repositories/generic.repository.js";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { idParamSchema, paginationSchema } from "./tiendas.schema.js";
import { getDiseno } from "../../services/tienda-diseno.service.js";
import { disenoPublico, proximoCambioDe } from "../campanas/resolver.js";
import { aIsoLima } from "../campanas/calendario.js";
import { getTiendasStore, setTiendasStore } from "./tiendas.cache.js";
import { localizar } from "../traducciones/localizar.js";
import { FUENTES } from "../traducciones/fuentes.js";
import { elegirIdioma, idiomasDePeticion } from "../idiomas/idiomas-tienda.js";
import { getComunicadosPublicos } from "../comunicados/comunicados.service.js";
import { edicionesParaResolver } from "../campanas/ediciones.service.js";

const tiendasRepository = new GenericRepository(prisma.tiendas, "Tienda");
const tiendasService = new GenericService(tiendasRepository, {
  searchFields: ["nombre", "slug"]
});
const tiendasController = new GenericController(tiendasService, "Tienda");

const router = Router();

// GET / - Listar tiendas (público — para lookup por slug)
router.get("/", validate({ query: paginationSchema }), async (req, res) => {
  const { lang, ...query } = req.validatedQuery || req.query;
  // La tienda aún no se conoce (se busca por slug): el idioma se elige
  // abajo con los suyos; la caché separa por el ?lang= pedido.
  const cacheKey = JSON.stringify({ ...query, lang: lang ?? null });
  // Con permiso de vista previa (docs/specs/idiomas B3) el selector suma un
  // idioma sin publicar: esa respuesta no se lee ni se guarda en la caché.
  const conCache = !req.permisoVistaPrevia;

  const cached = conCache && getTiendasStore(cacheKey);
  if (cached) {
    return apiResponse(res, cached);
  }

  const { data, meta } = await tiendasService.findAll(query);

  // Cuando el storefront resuelve una tienda puntual por slug, se adjunta
  // su personalización visual (barra de anuncios, hero) para evitar un
  // segundo request público. La invalidación llega vía
  // invalidateTiendasStoreCache() al guardar el diseño en el admin.
  // Hasta cuándo vale lo que se calculó (el cambio de campaña más cercano).
  let ttlMs;
  if (query.slug && data.length === 1) {
    // Sin la lista de campañas (nunca se publican las futuras) y con la
    // vigente ya resuelta en hora de Lima. La caché de 60 s hace que un
    // cambio de campaña tarde como máximo un minuto en verse (R3.4).
    const diseno = await getDiseno(data[0].id);
    const ahora = new Date();
    // Fechas por año de la plataforma (Cyber Wow): caché de 60 s que se limpia al cargar una edición.
    const ediciones = await edicionesParaResolver();
    data[0].diseno = disenoPublico(diseno, ahora, data[0].tipoNegocio, ediciones);
    // R3.9.1: la tienda abierta programa su recarga a esta hora; la caché HTTP y
    // la de memoria no la pasan.
    const cambio = proximoCambioDe(diseno.campanas, ahora, ediciones);
    data[0].proximoCambio = cambio ? aIsoLima(cambio) : null;
    if (cambio) ttlMs = cambio.getTime() - ahora.getTime();
    // Comunicados vigentes, ya resueltos en hora de Lima (docs/specs/comunicados R2.1).
    data[0].comunicados = await getComunicadosPublicos(data[0].id);
    // Idiomas del selector y textos del diseño en el idioma pedido (docs/specs/idiomas D2, D5).
    const visibles = await idiomasDePeticion(data[0].id, req.permisoVistaPrevia);
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
  if (conCache) setTiendasStore(cacheKey, responsePayload, ttlMs);

  return apiResponse(res, responsePayload);
});

// GET /:id - Obtener tienda por ID (público)
router.get("/:id", validate({ params: idParamSchema }), tiendasController.findById);

export default router;
