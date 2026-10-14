import MemoryCache from "../../utils/memory-cache.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { crearIdioma } from "./idioma.js";
import { actualizarFilaIdioma, buscarIdioma, crearFilaIdioma, listarIdiomas } from "./idiomas.repository.js";

/**
 * Idiomas de la plataforma (docs/specs/idiomas D1, diseno.md B1). Los da de
 * alta el administrador de la plataforma; casi nunca cambian, así que los
 * activos se cachean y se invalidan al editar.
 */

const TTL_MS = 60_000;
const CLAVE = "activos";
const cache = new MemoryCache({ max: 1 });

const usuarioDe = (user) => user?.email ?? user?.id ?? null;
const error = (message) => new ValidationError(message, { message });

/** Idiomas activos, en el orden de la plataforma. @returns {Promise<ReadonlyArray<import("./idioma.js").Idioma>>} */
export async function idiomasActivos() {
  const enCache = cache.get(CLAVE);
  if (enCache) return enCache;
  const idiomas = Object.freeze((await listarIdiomas({ activo: true })).map(crearIdioma));
  cache.set(CLAVE, idiomas, TTL_MS);
  return idiomas;
}

/** Idioma activo por código, o null. */
export async function idiomaActivo(codigo) {
  return (await idiomasActivos()).find((i) => i.codigo === codigo) ?? null;
}

/** El idioma base (siempre activo: actualizarIdioma no deja apagarlo). */
export async function idiomaBase() {
  return (await idiomasActivos()).find((i) => i.esBase);
}

export function invalidarIdiomas() {
  cache.clear();
}

/**
 * Los idiomas que elige una tienda deben estar activos en la plataforma.
 * Devuelve la lista sin repetidos, en el orden de la plataforma.
 */
export async function validarIdiomasDeTienda(codigos) {
  const activos = await idiomasActivos();
  const desconocidos = codigos.filter((c) => !activos.some((i) => i.codigo === c));
  if (desconocidos.length) throw error(`Idioma no disponible: ${desconocidos.join(", ")}`);
  return activos.filter((i) => codigos.includes(i.codigo)).map((i) => i.codigo);
}

// ── Administración de la plataforma ───────────────────────────────────

/** Todos, también los inactivos (pantalla Idiomas de la plataforma). */
export async function listarTodos() {
  return (await listarIdiomas()).map(crearIdioma);
}

export async function crearIdiomaPlataforma(datos, user) {
  if (await buscarIdioma(datos.codigo)) throw new ConflictError(`El idioma ${datos.codigo} ya existe`);
  const fila = await crearFilaIdioma({ ...datos, usuarioRegistro: usuarioDe(user) });
  invalidarIdiomas();
  return crearIdioma(fila);
}

export async function actualizarIdioma(codigo, datos, user) {
  const actual = await buscarIdioma(codigo);
  if (!actual) throw new NotFoundError("Idioma");
  // El base es en el que el dueño escribe: sin él no hay texto al que volver.
  if (crearIdioma(actual).esBase && datos.activo === false) throw error("El idioma base no se puede desactivar");
  const fila = await actualizarFilaIdioma(codigo, {
    ...datos, fechaActualizacion: new Date(), usuarioActualizacion: usuarioDe(user)
  });
  invalidarIdiomas();
  return crearIdioma(fila);
}
