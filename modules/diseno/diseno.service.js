import { prisma } from "../../config/prisma.js";
import { ValidationError } from "../../utils/errors.js";
import { borrarClaves, disenoAdmin, getDiseno, upsertClave } from "../../services/tienda-diseno.service.js";
import { buscarPlantilla, PLANTILLAS } from "./plantillas.js";
import { PALETAS } from "./paletas.js";
import { TIPOGRAFIAS } from "./tipografias.js";
import { PRESETS_SECCION } from "./presets.js";
import { copiarPlantilla } from "./copia.js";
import { FORMATO_ACTUAL } from "./migrar.js";
import { urlTienda } from "../resenas/resenas.service.js";

/**
 * Diseño para el editor del admin, con la URL pública de la tienda para el
 * botón "Ver en mi tienda" (R7.4).
 */
export async function getDisenoAdmin(tiendaId) {
  const tienda = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } });
  const diseno = disenoAdmin(await getDiseno(tiendaId));
  return { ...diseno, urlTienda: tienda ? urlTienda(tienda.slug, "") : null };
}

/**
 * Catálogo para el editor del admin (R1.2): plantillas con sus secciones de
 * ejemplo (miniaturas y sugerencias de texto), paletas, tipografías y los
 * presets de cada tipo de sección.
 */
export function getCatalogo() {
  return {
    formato: FORMATO_ACTUAL,
    plantillas: PLANTILLAS,
    paletas: PALETAS,
    tipografias: TIPOGRAFIAS,
    presetsSeccion: PRESETS_SECCION
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

  const usuario = user?.email || user?.id || "system";
  const diseno = await getDiseno(tiendaId);
  const estructura = copiarPlantilla(plantilla, { estructuraAnterior: diseno.estructura, hero: diseno.hero });

  await prisma.$transaction([
    upsertClave(tiendaId, "estructura_anterior", { estructura: diseno.estructura ?? null }, usuario),
    upsertClave(tiendaId, "estructura", estructura, usuario)
  ]);

  return disenoAdmin(await getDiseno(tiendaId));
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

  return disenoAdmin(await getDiseno(tiendaId));
}
