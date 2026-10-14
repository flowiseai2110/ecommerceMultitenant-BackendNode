import { prisma } from "../../config/prisma.js";
import MemoryCache from "../../utils/memory-cache.js";
import { idiomaBase, idiomasActivos } from "./idiomas.service.js";

/**
 * Idiomas de una tienda y el idioma de cada petición de la tienda
 * (docs/specs/idiomas D2, diseno.md B2).
 *
 * Specification `idiomaVisible` (P5 refinada): activo en la plataforma ∧
 * elegido por la tienda ∧ (es el base ∨ ya publicado). Publicar exige el 100 %
 * de los textos fijos y lo hace publicacion.service.js cuando algo puede
 * cambiarlo (guardar una traducción, elegir el idioma): aquí solo se lee, así
 * cada visita a la tienda no calcula avances.
 */

const TTL_MS = 60_000;
// Solo los códigos de la tienda: los datos de cada idioma salen de
// idiomasActivos(), así editar un idioma de la plataforma no deja nada viejo aquí.
const cache = new MemoryCache({ max: 1000 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { idiomas, publicados } de la tienda (cacheado). */
export async function codigosDeTienda(tiendaId) {
  const enCache = cache.get(tiendaId);
  if (enCache) return enCache;
  const t = await prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { idiomas: true, idiomasPublicados: true } });
  const codigos = { idiomas: t?.idiomas ?? [], publicados: t?.idiomasPublicados ?? [] };
  cache.set(tiendaId, codigos, TTL_MS);
  return codigos;
}

export function invalidarIdiomasDeTienda() {
  cache.clear();
}

/**
 * Idiomas que eligió la tienda y la plataforma tiene activos, en el orden de
 * la plataforma (el base siempre). Es con los que trabaja el dueño en
 * Traducciones, aunque todavía no se muestren.
 */
export async function idiomasElegidos(tiendaId) {
  const { idiomas } = await codigosDeTienda(tiendaId);
  return (await idiomasActivos()).filter((i) => i.esBase || idiomas.includes(i.codigo));
}

/** Idiomas que la tienda muestra en su selector (Specification idiomaVisible). */
export async function idiomasVisibles(tiendaId) {
  const { publicados } = await codigosDeTienda(tiendaId);
  return (await idiomasElegidos(tiendaId)).filter((i) => i.esBase || publicados.includes(i.codigo));
}

/**
 * El idioma pedido si es uno de `disponibles`; si no, el base. Un `?lang=`
 * desconocido u oculto nunca da error: un enlace viejo se ve en el idioma base.
 */
export async function elegirIdioma(disponibles, codigo) {
  return disponibles.find((i) => i.codigo === codigo) ?? (await idiomaBase());
}

/** Idioma de una petición a la tienda: el pedido, si la tienda lo muestra. */
export async function idiomaDePeticion(tiendaId, codigo) {
  // Sin tienda conocida (p. ej. GET /categorias/:id) basta con que la
  // plataforma lo tenga activo: los textos son de la fila, y sin traducción
  // cae al base igual.
  return elegirIdioma(tiendaId ? await idiomasVisibles(tiendaId) : await idiomasActivos(), codigo);
}

/** Middleware de /store: deja en `req.idioma` un Idioma (nunca null). */
export async function resolverIdioma(req, _res, next) {
  try {
    const candidato = req.query?.tiendaId ?? req.body?.tiendaId;
    const tiendaId = req.tiendaId ?? (UUID.test(typeof candidato === "string" ? candidato : "") ? candidato : null);
    const pedido = req.query?.lang ?? req.body?.lang;
    req.idioma = await idiomaDePeticion(tiendaId, typeof pedido === "string" ? pedido : null);
    next();
  } catch (error) {
    next(error);
  }
}
