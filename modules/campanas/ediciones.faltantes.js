import { logger } from "../../config/logger.js";
import { avisarPlataforma } from "../plataforma/avisos.js";
import { fechaCivilLima, inicioDiaLima } from "./calendario.js";
import { listarEdiciones } from "./ediciones.repository.js";
import { presetsPorAnio } from "./ediciones.service.js";

/**
 * Aviso de fechas por año sin cargar (docs/specs/campanas-cuando R2.6.4).
 * Por cada edición esperada sin cargar del año en curso y el siguiente: una
 * línea en la bitácora (una vez por proceso) y, a 60 días del inicio previsto
 * (el día 1 del mes esperado), un correo a la plataforma (una vez, idempotente
 * por la clave única de avisos_plataforma).
 */

export const DIAS_AVISO = 60;
const DIA_MS = 86_400_000;

/**
 * Ediciones esperadas, sin cargar y que aún no pasaron (su mes no terminó).
 * Pura. `avisarPorCorreo` es true desde 60 días antes del día 1 de su mes.
 */
export function edicionesFaltantes(ediciones, ahora) {
  const { anio: actual } = fechaCivilLima(ahora);
  const faltantes = [];
  for (const preset of presetsPorAnio()) {
    for (const anio of [actual, actual + 1]) {
      for (const esp of preset.regla.edicionesEsperadas) {
        if (ediciones.some((e) => e.presetId === preset.id && e.anio === anio && e.clave === esp.clave)) continue;
        const inicioPrevisto = inicioDiaLima({ anio, mes: esp.mes, dia: 1 });
        const finMes = inicioDiaLima({ anio, mes: esp.mes + 1, dia: 1 });
        if (ahora >= finMes) continue;
        faltantes.push({
          presetId: preset.id, campana: preset.nombre, anio, clave: esp.clave, edicion: esp.nombre,
          inicioPrevisto,
          avisarPorCorreo: ahora.getTime() >= inicioPrevisto.getTime() - DIAS_AVISO * DIA_MS
        });
      }
    }
  }
  return faltantes;
}

const yaEnBitacora = new Set();

/** Revisa y avisa. Lo llama el job; no lanza. */
export async function revisarFechasFaltantes(ahora = new Date()) {
  try {
    const faltantes = edicionesFaltantes(await listarEdiciones(), ahora);
    for (const f of faltantes) {
      const clave = `${f.presetId}:${f.anio}:${f.clave}`;
      if (!yaEnBitacora.has(clave)) {
        yaEnBitacora.add(clave);
        logger.warn(`Falta cargar las fechas de ${f.campana} ${f.edicion} ${f.anio} (campañas › fechas por año)`);
      }
      if (f.avisarPorCorreo) {
        await avisarPlataforma(`campana-fechas:${clave}`, {
          titulo: `Faltan las fechas del ${f.campana} de ${f.edicion.toLowerCase()} ${f.anio}`,
          parrafos: [
            `Todavía no está cargada la edición de ${f.edicion.toLowerCase()} de ${f.anio} del ${f.campana}. Las tiendas que lo tienen activado no mostrarán la campaña hasta que se cargue.`,
            "Qué hacer: cuando se anuncien las fechas, cárgalas en el Admin, en Campañas › Fechas por año (/campanas-plataforma)."
          ],
          detalle: { presetId: f.presetId, anio: f.anio, clave: f.clave }
        });
      }
    }
    return faltantes;
  } catch (e) {
    logger.warn(`No se pudo revisar las fechas por año faltantes: ${e.message}`);
    return [];
  }
}

/** Solo para tests. */
export function reiniciarBitacora() {
  yaEnBitacora.clear();
}
