import MemoryCache from "../../utils/memory-cache.js";
import { logger } from "../../config/logger.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { invalidateTiendasStoreCache } from "../tenants/tiendas.cache.js";
import { CAMPANA_PRESETS, buscarPreset } from "./presets.js";
import { fechaCivilLima, horaAMs, inicioDiaLima, parsearFecha } from "./calendario.js";
import {
  borrarEdicion, contarTiendasConCampana, guardarEdicion, listarEdiciones, listarHistorial
} from "./ediciones.repository.js";

/**
 * Fechas por año de las campañas del catálogo (docs/specs/campanas-cuando R2):
 * lo que lee la resolución de la tienda y lo que escribe el administrador de
 * la plataforma. Qué ediciones se esperan lo dice el preset (R7.1).
 */

export const MAX_DIAS_EDICION = 30;
const TTL_MS = 60_000;
const DIA_MS = 86_400_000;
const cache = new MemoryCache({ max: 1 });

const usuarioDe = (user) => user?.email ?? user?.id ?? "system";

/** Presets cuya fecha se carga a mano. */
export const presetsPorAnio = () => CAMPANA_PRESETS.filter((p) => p.regla.tipo === "porAnio");

export function invalidarEdiciones() {
  cache.clear();
}

/**
 * Ediciones cargadas, para resolver la campaña de una tienda (caché 60 s,
 * se limpia al escribir). Si la tabla no responde se resuelve sin "por año" y
 * queda en la bitácora: la tienda nunca se cae por el Cyber Wow (R2.6.1).
 */
export async function edicionesParaResolver() {
  const enCache = cache.get("todas");
  if (enCache) return enCache;
  try {
    const todas = Object.freeze(await listarEdiciones());
    cache.set("todas", todas, TTL_MS);
    return todas;
  } catch (e) {
    logger.warn(`No se pudieron leer las ediciones de campañas (${e.message}): se resuelve sin fechas por año`);
    return [];
  }
}

function presetPorAnio(presetId) {
  const preset = buscarPreset(presetId);
  if (!preset || preset.regla.tipo !== "porAnio") throw new NotFoundError("Campaña", "Esa campaña no tiene fechas por año");
  return preset;
}

function esperada(preset, clave) {
  const e = preset.regla.edicionesEsperadas.find((x) => x.clave === clave);
  if (!e) throw new NotFoundError("Edición", `${preset.nombre} no tiene una edición "${clave}"`);
  return e;
}

/** [inicio, fin) de una edición como instantes (horas de Lima; sin hora, el día completo). */
export function rangoDeEdicion(e) {
  const inicio = new Date(inicioDiaLima(parsearFecha(e.inicio)).getTime() + (horaAMs(e.horaInicio) ?? 0));
  const ultimo = parsearFecha(e.fin);
  const fin = e.horaFin ? new Date(inicioDiaLima(ultimo).getTime() + horaAMs(e.horaFin)) : inicioDiaLima(ultimo, 1);
  return { inicio, fin };
}

const FORMATO = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
const fechaCorta = (f) => FORMATO.format(new Date(`${f}T00:00:00Z`)).replace(".", "");

/**
 * Reglas de una edición (R2.4, CA-2.7): fin posterior, máximo 30 días, empieza
 * en su año y no se cruza con otra del mismo año. Pura: devuelve el primer
 * error como `{ campo, message }` o null.
 */
export function errorDeEdicion(nueva, anio, otras = []) {
  const { inicio, fin } = rangoDeEdicion(nueva);
  if (inicio >= fin) return { campo: "fin", message: "La fecha y hora de fin deben ser posteriores al inicio." };

  const inicioCivil = fechaCivilLima(inicio);
  if (inicioCivil.anio !== anio) return { campo: "inicio", message: `La edición debe empezar en ${anio}.` };

  const ultimo = fechaCivilLima(new Date(fin.getTime() - 1));
  const dias = Math.round((inicioDiaLima(ultimo) - inicioDiaLima(inicioCivil)) / DIA_MS) + 1;
  if (dias > MAX_DIAS_EDICION) {
    return { campo: "fin", message: `Una edición dura como máximo ${MAX_DIAS_EDICION} días (esta dura ${dias}).` };
  }

  for (const otra of otras) {
    const r = rangoDeEdicion(otra);
    if (inicio < r.fin && r.inicio < fin) {
      return { campo: "inicio", message: `Se cruza con la edición ${otra.nombre} (${fechaCorta(otra.inicio)} – ${fechaCorta(otra.fin)}).` };
    }
  }
  return null;
}

const comoEdicion = (preset, anio, clave, body, nombreDefecto) => ({
  presetId: preset.id, anio, clave,
  nombre: body.nombre ?? nombreDefecto,
  inicio: body.inicio, horaInicio: body.horaInicio ?? null,
  fin: body.fin, horaFin: body.horaFin ?? null,
  fuente: body.fuente ?? null
});

/** Pantalla de plataforma: por campaña "por año", sus ediciones esperadas del año con lo cargado y su historial. */
export async function vistaAnio(anio) {
  const todas = await listarEdiciones();
  return Promise.all(presetsPorAnio().map(async (preset) => {
    const delAnio = todas.filter((e) => e.presetId === preset.id && e.anio === anio);
    const historial = await listarHistorial(preset.id, anio);
    return {
      presetId: preset.id,
      nombre: preset.nombre,
      anio,
      ediciones: preset.regla.edicionesEsperadas.map((esp) => ({
        ...esp,
        cargada: delAnio.find((e) => e.clave === esp.clave) ?? null,
        historial: historial
          .filter((h) => h.clave === esp.clave)
          .map(({ id, accion, antes, despues, usuario, fecha }) => ({ id, accion, antes, despues, usuario, fecha }))
      }))
    };
  }));
}

/** Crea o cambia una edición (solo el administrador de la plataforma; lo exige la ruta). */
export async function guardar({ presetId, anio, clave }, body, user) {
  const preset = presetPorAnio(presetId);
  const esp = esperada(preset, clave);
  const nueva = comoEdicion(preset, anio, clave, body, esp.nombre);

  const delAnio = (await listarEdiciones()).filter((e) => e.presetId === presetId && e.anio === anio);
  const antes = delAnio.find((e) => e.clave === clave) ?? null;

  const error = errorDeEdicion(nueva, anio, delAnio.filter((e) => e.clave !== clave));
  if (error) throw new ValidationError(error.message, { [error.campo]: error.message, message: error.message });

  const usuario = usuarioDe(user);
  const guardada = await guardarEdicion({ presetId, anio, clave }, nueva, antes, usuario);
  alEscribir(`${antes ? "cambió" : "cargó"} ${presetId} ${clave} ${anio}`, usuario);
  return guardada;
}

export async function eliminar({ presetId, anio, clave }, user) {
  const preset = presetPorAnio(presetId);
  esperada(preset, clave);
  const antes = (await listarEdiciones()).find((e) => e.presetId === presetId && e.anio === anio && e.clave === clave);
  if (!antes) throw new NotFoundError("Edición", "Esa edición no está cargada");
  const usuario = usuarioDe(user);
  await borrarEdicion(antes, usuario);
  alEscribir(`borró ${presetId} ${clave} ${anio}`, usuario);
}

/**
 * Una edición afecta a TODAS las tiendas con la campaña activa: se limpia la
 * caché de la resolución y la de la respuesta pública (no `invalidateTiendaCache`,
 * que solo guarda la identidad de la tienda). La caché HTTP ya entregada tarda
 * hasta 5 min (R3.9.4).
 */
function alEscribir(que, usuario) {
  invalidarEdiciones();
  invalidateTiendasStoreCache();
  logger.info(`Fechas por año: ${usuario} ${que}`);
}

/** Cuántas tiendas tienen activada la campaña (R7.7): solo el número. */
export async function tiendasConCampana(presetId) {
  presetPorAnio(presetId);
  return { total: await contarTiendasConCampana(presetId) };
}
