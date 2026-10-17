import { prisma } from "../../config/prisma.js";
import MemoryCache from "../../utils/memory-cache.js";
import { textoLocal } from "./texto-local.js";

/**
 * Opciones de las variantes ("Talla", "Color" y sus valores "M", "Rojo"…)
 * traducidas una vez por tienda (docs/specs/idiomas, decisión 2026-10-16). En
 * cada producto se escriben libres (`metadata.opciones`) y son también llaves
 * de la lógica (`variante.atributos`, filtros del catálogo): lo guardado no
 * cambia; la tienda recibe un diccionario palabra → traducción y solo traduce
 * lo que muestra.
 *
 * Las traducciones viven en la configuración de la tienda
 * (`tienda_configuraciones`, clave `traducciones_opciones`), con la forma de
 * siempre: { <codigo>: { <palabra>: { t, o, m } } }.
 */

const CLAVE = "traducciones_opciones";
const CATEGORIA = "idiomas";
const TTL_MS = 60_000;
const cache = new MemoryCache({ max: 2000 });

/**
 * Palabras distintas de las opciones (nombres y valores), en el orden en que
 * aparecen. Los valores de una opción de tipo color son códigos de la paleta
 * ("negro"): su nombre es un texto fijo de la plataforma, no del dueño. Puro:
 * recibe la `metadata` de los productos.
 */
export function palabrasDeOpciones(metadatas) {
  const palabras = new Set();
  for (const m of metadatas) {
    for (const o of Array.isArray(m?.opciones) ? m.opciones : []) {
      if (typeof o?.nombre === "string" && o.nombre.trim()) palabras.add(o.nombre.trim());
      if (o?.tipo === "color") continue;
      for (const v of Array.isArray(o?.valores) ? o.valores : []) if (typeof v === "string" && v.trim()) palabras.add(v.trim());
    }
  }
  return [...palabras];
}

/** Las palabras de las opciones de los productos activos de la tienda. */
export async function palabrasDeTienda(tiendaId) {
  const productos = await prisma.productos.findMany({ where: { tiendaId, activo: true }, select: { metadata: true } });
  return palabrasDeOpciones(productos.map((p) => p.metadata));
}

export async function leerTraduccionesOpciones(tiendaId) {
  const fila = await prisma.tienda_configuraciones.findUnique({ where: { uq_tienda_clave: { tiendaId, clave: CLAVE } }, select: { valor: true } });
  return fila?.valor ?? {};
}

export async function guardarTraduccionesOpciones(tiendaId, valor, usuario) {
  await prisma.tienda_configuraciones.upsert({
    where: { uq_tienda_clave: { tiendaId, clave: CLAVE } },
    create: { tiendaId, clave: CLAVE, valor, categoria: CATEGORIA, usuarioRegistro: usuario },
    update: { valor, fechaActualizacion: new Date(), usuarioActualizacion: usuario }
  });
}

/**
 * Lo que la tienda muestra en un idioma: palabra → su traducción (solo las que
 * tienen una vigente; las demás se ven como se escribieron). Puro.
 */
export function diccionarioDeOpciones(traducciones, codigo) {
  const delIdioma = traducciones?.[codigo] ?? {};
  return Object.fromEntries(Object.entries(delIdioma)
    .map(([palabra, tr]) => [palabra, textoLocal(palabra, tr)])
    .filter(([palabra, texto]) => texto && texto !== palabra));
}

/** El diccionario de opciones de una tienda en un idioma (cacheado; vacío en el base). */
export async function opcionesTraducidas(tiendaId, idioma) {
  if (!tiendaId || idioma.esBase) return {};
  const llave = `${tiendaId}|${idioma.codigo}`;
  const enCache = cache.get(llave);
  if (enCache) return enCache;
  const dic = Object.freeze(diccionarioDeOpciones(await leerTraduccionesOpciones(tiendaId), idioma.codigo));
  cache.set(llave, dic, TTL_MS);
  return dic;
}

export function invalidarOpciones() {
  cache.clear();
}
