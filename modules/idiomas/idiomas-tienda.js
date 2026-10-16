import { prisma } from "../../config/prisma.js";
import MemoryCache from "../../utils/memory-cache.js";
import { idiomaBase, idiomasActivos } from "./idiomas.service.js";
import { CABECERA_VISTA_PREVIA, firmarPermisoVistaPrevia, sinCachePublica, verificarPermisoVistaPrevia } from "./vista-previa.js";
import { ValidationError } from "../../utils/errors.js";

/**
 * Idiomas de una tienda y el idioma de cada petición de la tienda
 * (docs/specs/idiomas D2, diseno.md B2).
 *
 * Specification `idiomaVisible` (P5 refinada): activo en la plataforma ∧
 * elegido por la tienda ∧ (es el base ∨ ya publicado). Publicar exige el 100 %
 * de los textos fijos y lo hace publicacion.service.js cuando algo puede
 * cambiarlo (guardar una traducción, elegir el idioma): aquí solo se lee, así
 * cada visita a la tienda no calcula avances.
 *
 * Vista previa (diseno.md B3): con un permiso firmado para esta tienda, el
 * idioma del permiso también vale aunque no esté publicado (si la tienda lo
 * eligió). Sin permiso, nada cambia.
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
 * Los idiomas con que se puede pedir la tienda: los visibles y, con un permiso
 * de vista previa de ESTA tienda, también el del permiso si la tienda lo eligió.
 * En el orden de la plataforma.
 */
export async function idiomasDePeticion(tiendaId, permiso = null) {
  const visibles = await idiomasVisibles(tiendaId);
  if (permiso?.tiendaId !== tiendaId || visibles.some((i) => i.codigo === permiso.idioma)) return visibles;
  const codigos = new Set([...visibles.map((i) => i.codigo), permiso.idioma]);
  return (await idiomasElegidos(tiendaId)).filter((i) => codigos.has(i.codigo));
}

/**
 * Permiso de vista previa para el modo traducir (diseno.md B3): solo de un
 * idioma que la tienda eligió y que no es el base (el base siempre se ve).
 * Con el slug, para que la ruta arme la URL pública de la tienda.
 * @returns {Promise<{ token: string, expiraEn: string, slug: string }>}
 */
export async function permisoVistaPrevia(tiendaId, codigo) {
  const idioma = (await idiomasElegidos(tiendaId)).find((i) => i.codigo === codigo);
  if (!idioma || idioma.esBase) {
    const message = "Ese idioma no es uno de los que ofrece tu tienda";
    throw new ValidationError(message, { message });
  }
  const [permiso, tienda] = await Promise.all([
    firmarPermisoVistaPrevia({ tiendaId, idioma: idioma.codigo }),
    prisma.tiendas.findUnique({ where: { id: tiendaId }, select: { slug: true } })
  ]);
  return { ...permiso, slug: tienda?.slug ?? null };
}

/**
 * El idioma pedido si es uno de `disponibles`; si no, el base. Un `?lang=`
 * desconocido u oculto nunca da error: un enlace viejo se ve en el idioma base.
 */
export async function elegirIdioma(disponibles, codigo) {
  return disponibles.find((i) => i.codigo === codigo) ?? (await idiomaBase());
}

/** Idioma de una petición a la tienda: el pedido, si la tienda lo muestra (o hay permiso de vista previa). */
export async function idiomaDePeticion(tiendaId, codigo, permiso = null) {
  // Sin tienda conocida (p. ej. GET /categorias/:id) basta con que la
  // plataforma lo tenga activo: los textos son de la fila, y sin traducción
  // cae al base igual.
  return elegirIdioma(tiendaId ? await idiomasDePeticion(tiendaId, permiso) : await idiomasActivos(), codigo);
}

/**
 * Middleware de /store: deja en `req.idioma` un Idioma (nunca null) y, si
 * llegó un permiso de vista previa válido, `req.permisoVistaPrevia`. Una
 * respuesta con permiso no se guarda en cachés compartidas (sinCachePublica)
 * ni en la de respuestas (cacheRespuesta la salta).
 */
export async function resolverIdioma(req, res, next) {
  try {
    req.permisoVistaPrevia = await verificarPermisoVistaPrevia(req.get?.(CABECERA_VISTA_PREVIA));
    if (req.permisoVistaPrevia) sinCachePublica(res);
    const candidato = req.query?.tiendaId ?? req.body?.tiendaId;
    const tiendaId = req.tiendaId ?? (UUID.test(typeof candidato === "string" ? candidato : "") ? candidato : null);
    const pedido = req.query?.lang ?? req.body?.lang;
    req.idioma = await idiomaDePeticion(tiendaId, typeof pedido === "string" ? pedido : null, req.permisoVistaPrevia);
    next();
  } catch (error) {
    next(error);
  }
}
