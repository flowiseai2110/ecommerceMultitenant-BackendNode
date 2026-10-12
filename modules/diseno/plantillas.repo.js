import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { usarFilasDeLaBase } from "./plantillas.js";

// Carga de la tabla plantillas_diseno al registro en memoria
// (docs/specs/editor-diseno-en-vivo P2). El catálogo y las búsquedas son
// síncronas: leen el registro, no la base.

const RECARGA_MS = 5 * 60 * 1000;

/** Vuelve a leer la tabla. Si falla, el registro queda como estaba (al arrancar: solo las del código). */
export async function recargarPlantillas() {
  try {
    usarFilasDeLaBase(await prisma.plantillas_diseno.findMany());
  } catch (error) {
    logger.warn("No se pudieron leer las plantillas de diseño de la base; se usan las que ya estaban cargadas", { message: error.message });
  }
}

/** Al arrancar y cada 5 minutos (otra instancia pudo cambiarlas). */
export function iniciarRecargaPlantillas() {
  recargarPlantillas();
  const timer = setInterval(recargarPlantillas, RECARGA_MS);
  timer.unref?.();
}

/** Crea o reemplaza la fila de una plantilla y recarga el registro. */
export async function guardarFilaPlantilla(fila, usuario) {
  const { id, ...datos } = fila;
  await prisma.plantillas_diseno.upsert({
    where: { id },
    create: { id, ...datos, usuarioRegistro: usuario },
    update: { ...datos, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
  await recargarPlantillas();
}
