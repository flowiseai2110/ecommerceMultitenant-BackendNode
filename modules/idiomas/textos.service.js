import MemoryCache from "../../utils/memory-cache.js";
import { datosDe } from "../negocio/datos.js";
import { tiendaDe } from "../negocio/rubros.cache.js";
import { clavesDeGrupos, textosDePlataforma, textosDeTienda } from "./textos.repository.js";
import { crearTraductor, textoBase, TRADUCTOR_BASE } from "./traductor.js";
import { idiomaActivo } from "./idiomas.service.js";
import { IDIOMA_BASE } from "./idioma.js";

export { textoBase };

/**
 * Textos fijos de la tienda en un idioma (docs/specs/idiomas D7, diseno.md B7).
 *
 * Texto que ve el visitante: el que tradujo la tienda → el de la plataforma →
 * el texto base (la propia clave, sin su contexto: 'Salida|tour' → "Salida").
 * Solo entran las claves de los grupos del rubro de la tienda.
 */

const TTL_MS = 60_000;
const cache = new MemoryCache({ max: 2000 });

/** Grupos de textos que muestra la tienda (los de su rubro, desde la BD). */
export async function gruposDeTienda(tiendaId) {
  return datosDe((await tiendaDe(tiendaId)).tipoNegocio).gruposTextos;
}

/** Claves vigentes que la tienda muestra. @returns {Promise<{ clave: string, grupo: string }[]>} */
export async function clavesDeTienda(tiendaId) {
  return clavesDeGrupos([...(await gruposDeTienda(tiendaId))]);
}

/**
 * Diccionario clave → texto traducido de una tienda en un idioma (solo las
 * claves que tienen traducción). Cacheado; se invalida al guardar textos.
 */
export async function diccionario(tiendaId, idioma) {
  const llave = `${tiendaId}|${idioma.codigo}`;
  const enCache = cache.get(llave);
  if (enCache) return enCache;
  const [claves, plataforma, propias] = await Promise.all([
    clavesDeTienda(tiendaId), textosDePlataforma(idioma.codigo), textosDeTienda(tiendaId, idioma.codigo)
  ]);
  const dePlataforma = new Map(plataforma.map((t) => [t.clave, t.texto]));
  const deTienda = new Map(propias.map((t) => [t.clave, t.texto]));
  const dic = {};
  for (const { clave } of claves) {
    const texto = deTienda.get(clave) ?? dePlataforma.get(clave);
    if (texto) dic[clave] = texto;
  }
  const congelado = Object.freeze(dic);
  cache.set(llave, congelado, TTL_MS);
  return congelado;
}

/** Cuántos textos fijos de la tienda tienen traducción en un idioma (para P5 y Mi Tienda). */
export async function avanceTextos(tiendaId, idioma) {
  const [claves, dic] = await Promise.all([clavesDeTienda(tiendaId), diccionario(tiendaId, idioma)]);
  return { total: claves.length, traducidos: Object.keys(dic).length };
}

/**
 * Traductor de textos fijos para el servidor (correos, mensajes):
 *   const t = await textosPara(tiendaId, idioma); t("Quedan {n}", { n: 3 })
 */
export async function textosPara(tiendaId, idioma) {
  return crearTraductor(await diccionario(tiendaId, idioma));
}

/**
 * Lo mismo con el código guardado (pedido, reserva) o pedido (`lang`). Sin
 * código, o con el base, uno inactivo o desconocido: el traductor base, sin
 * tocar la BD (es el caso más común: quien compra en el idioma base).
 */
export async function traductorPara(tiendaId, codigo) {
  const idioma = codigo && codigo !== IDIOMA_BASE ? await idiomaActivo(codigo) : null;
  return idioma && !idioma.esBase ? textosPara(tiendaId, idioma) : TRADUCTOR_BASE;
}

export function invalidarTextos() {
  cache.clear();
}
