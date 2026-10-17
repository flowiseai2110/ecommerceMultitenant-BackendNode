import MemoryCache from "../../utils/memory-cache.js";
import { logger } from "../../config/logger.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { CLAVES, PARAMETROS, existeParametro } from "./parametros.registro.js";
import { guardarFila, listarFilas } from "./parametros.repository.js";

/**
 * Parámetros de la plataforma (ver parametros.registro.js). Se leen seguido
 * (el job de transmisiones, cada minuto), así que se cachean 30 s y se
 * invalidan al guardar. Con varias réplicas, un cambio tarda hasta 30 s en
 * llegar a las demás.
 */

const TTL_MS = 30_000;
const CLAVE_CACHE = "valores";
const cache = new MemoryCache({ max: 1 });

const usuarioDe = (user) => user?.email ?? user?.id ?? "system";

/** Valor de la fila si es válido; si no (un dato viejo o tocado a mano), el de por defecto. */
function valorDe(clave, fila) {
  const def = PARAMETROS[clave];
  if (!fila) return def.porDefecto();
  const r = def.schema.safeParse(fila.valor);
  if (r.success) return r.data;
  logger.warn(`Parámetro ${clave} con un valor inválido en la BD (${JSON.stringify(fila.valor)}): se usa el de por defecto`);
  return def.porDefecto();
}

async function valores() {
  const enCache = cache.get(CLAVE_CACHE);
  if (enCache) return enCache;
  const filas = new Map((await listarFilas()).map(f => [f.clave, f]));
  const todos = Object.freeze(Object.fromEntries(CLAVES.map(c => [c, { valor: valorDe(c, filas.get(c)), fila: filas.get(c) ?? null }])));
  cache.set(CLAVE_CACHE, todos, TTL_MS);
  return todos;
}

/**
 * Valor de un parámetro. Si la BD no responde, el de por defecto: un parámetro
 * nunca debe frenar el corte de una transmisión.
 */
export async function parametro(clave) {
  if (!existeParametro(clave)) throw new Error(`Parámetro desconocido: ${clave} (agrégalo a parametros.registro.js)`);
  try {
    return (await valores())[clave].valor;
  } catch (e) {
    logger.warn(`No se pudieron leer los parámetros (${e.message}): se usa el de por defecto de ${clave}`);
    return PARAMETROS[clave].porDefecto();
  }
}

/** Todos, con su descripción, para la pantalla del admin. */
export async function listarParametros() {
  const todos = await valores();
  return CLAVES.map(clave => {
    const { grupo, titulo, descripcion, porDefecto } = PARAMETROS[clave];
    const { valor, fila } = todos[clave];
    return {
      clave, grupo, titulo, descripcion, valor,
      porDefecto: porDefecto(),
      tipo: typeof porDefecto(),
      cambiadoPor: fila?.usuarioActualizacion ?? null,
      cambiadoEn: fila?.fechaActualizacion ?? null
    };
  });
}

/** Guarda un valor validado por el registro. Solo el administrador de la plataforma (lo exige la ruta). */
export async function cambiarParametro(clave, valor, user) {
  if (!existeParametro(clave)) throw new NotFoundError("Parámetro", "Ese parámetro no existe");
  const r = PARAMETROS[clave].schema.safeParse(valor);
  if (!r.success) {
    const message = `Valor inválido para "${PARAMETROS[clave].titulo}": ${r.error.issues[0]?.message ?? "revisa el dato"}`;
    throw new ValidationError(message, { message });
  }
  await guardarFila(clave, r.data, usuarioDe(user));
  cache.clear();
  logger.info(`Parámetro ${clave} = ${JSON.stringify(r.data)} (por ${usuarioDe(user)})`);
  return (await listarParametros()).find(p => p.clave === clave);
}

/** Solo para tests. */
export function invalidarParametros() {
  cache.clear();
}
