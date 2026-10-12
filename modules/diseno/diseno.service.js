import { prisma } from "../../config/prisma.js";
import { ValidationError } from "../../utils/errors.js";
import { borrarClaves, disenoAdmin, getDiseno, upsertClave } from "../../services/tienda-diseno.service.js";
import { buscarPlantilla, PLANTILLAS, plantillaPorDefecto, tipoNegocioDe } from "./plantillas.js";
import { PALETAS } from "./paletas.js";
import { TIPOGRAFIAS } from "./tipografias.js";
import { PRESETS_SECCION } from "./presets.js";
import { copiarPlantilla } from "./copia.js";
import { FORMATO_ACTUAL } from "./migrar.js";
import { fotosAjenas, layoutDeNegocio, prefijoFotosDiseno, seccionesAjenas, TIPOS_POR_NEGOCIO } from "./secciones.schema.js";
import { publicBaseUrl } from "../../services/storage.service.js";
import { urlTienda } from "../resenas/resenas.service.js";

/** Tipo de negocio de la tienda tal como lo entienden las plantillas. */
async function negocioDeTienda(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { tipoNegocio: true } });
  return tipoNegocioDe(plantillaPorDefecto(tienda?.tipoNegocio));
}

/** Errores de zod del layout con la ruta del body (estructura.layout.…), como los del schema. */
function erroresDeLayout(error) {
  return Object.fromEntries(error.issues.map((i) => [["estructura", "layout", ...i.path].join("."), [i.message]]));
}

/**
 * Rechaza (400) una estructura con secciones que no corresponden al tipo de
 * negocio de la tienda (docs/specs/diseno-por-rubro H3) o con opciones de su
 * layout inválidas. Los errores llevan la misma ruta que los del schema, así
 * el admin marca la tarjeta culpable.
 *
 * Devuelve la estructura a guardar, con solo el layout de su rubro
 * (layout-por-rubro RU8): las opciones de otro rubro se descartan.
 */
export async function validarEstructuraDeTienda(tiendaId, estructura) {
  if (!estructura) return estructura;
  const negocio = await negocioDeTienda(tiendaId);
  const body = {
    ...seccionesAjenas(estructura.home.secciones, negocio),
    ...fotosAjenas(estructura.home.secciones, prefijoFotosDiseno(publicBaseUrl(), tiendaId))
  };
  let layout = estructura.layout;
  try {
    layout = layoutDeNegocio(estructura.layout, negocio);
  } catch (error) {
    if (!error?.issues) throw error;
    Object.assign(body, erroresDeLayout(error));
  }
  if (Object.keys(body).length > 0) {
    throw new ValidationError("Errores de validación", { message: Object.values(body)[0][0], body });
  }
  return { ...estructura, layout };
}

/**
 * Diseño para el editor del admin, con la URL pública de la tienda para el
 * botón "Ver en mi tienda" (R7.4).
 */
export async function getDisenoAdmin(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true, tipoNegocio: true } });
  const diseno = disenoAdmin(await getDiseno(tiendaId), tienda?.tipoNegocio);
  return { ...diseno, urlTienda: tienda ? urlTienda(tienda.slug, "") : null };
}

/**
 * Catálogo para el editor del admin (R1.2): plantillas con sus secciones de
 * ejemplo (miniaturas y sugerencias de texto), paletas, tipografías, los
 * presets de cada tipo de sección y qué secciones puede usar cada tipo de
 * negocio (diseno-por-rubro H1). Cada plantilla trae su `tipoNegocio`.
 */
export function getCatalogo() {
  return {
    formato: FORMATO_ACTUAL,
    plantillas: PLANTILLAS,
    paletas: PALETAS,
    tipografias: TIPOGRAFIAS,
    presetsSeccion: PRESETS_SECCION,
    tiposPorNegocio: TIPOS_POR_NEGOCIO
  };
}

/**
 * Aplica una plantilla (R2.2) o la restaura (R4.5): guarda una copia nueva
 * con las reglas de R3 y deja la estructura previa en `estructura_anterior`
 * para poder deshacer (R3.6). `{ estructura: null }` = la tienda no tenía
 * una (deshacer la vuelve a la clásica por defecto).
 */
export async function aplicarPlantilla(tiendaId, plantillaId, user) {
  const plantilla = buscarPlantilla(plantillaId);
  if (!plantilla) {
    const message = "Plantilla inexistente";
    throw new ValidationError(message, { message });
  }
  if (tipoNegocioDe(plantilla) !== (await negocioDeTienda(tiendaId))) {
    const message = "Esta plantilla es para otro tipo de negocio";
    throw new ValidationError(message, { message });
  }

  const usuario = user?.email || user?.id || "system";
  const diseno = await getDiseno(tiendaId);
  const estructura = copiarPlantilla(plantilla, { estructuraAnterior: diseno.estructura, hero: diseno.hero });

  await prisma.$transaction([
    upsertClave(tiendaId, "estructura_anterior", { estructura: diseno.estructura ?? null }, usuario),
    upsertClave(tiendaId, "estructura", estructura, usuario)
  ]);

  return disenoAdmin(await getDiseno(tiendaId), tipoNegocioDe(plantilla));
}

/** Vuelve a la estructura previa a aplicar o restaurar una plantilla (R3.6). */
export async function deshacerEstructura(tiendaId, user) {
  const usuario = user?.email || user?.id || "system";
  const { estructura_anterior: anterior } = await getDiseno(tiendaId);
  if (!anterior) {
    const message = "No hay cambios de plantilla para deshacer";
    throw new ValidationError(message, { message });
  }

  await prisma.$transaction([
    anterior.estructura
      ? upsertClave(tiendaId, "estructura", anterior.estructura, usuario)
      : borrarClaves(tiendaId, ["estructura"]),
    borrarClaves(tiendaId, ["estructura_anterior"])
  ]);

  return disenoAdmin(await getDiseno(tiendaId), await negocioDeTienda(tiendaId));
}
