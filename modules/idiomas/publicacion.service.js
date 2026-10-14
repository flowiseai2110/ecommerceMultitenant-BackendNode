import { prisma } from "../../config/prisma.js";
import { invalidateTiendasStoreCache } from "../tenants/tiendas.cache.js";
import { codigosDeTienda, idiomasElegidos, invalidarIdiomasDeTienda } from "./idiomas-tienda.js";
import { avanceTextos } from "./textos.service.js";

/**
 * Publicar un idioma de la tienda (docs/specs/idiomas, P5 refinada).
 *
 * Un idioma elegido aparece en el selector la primera vez que llega al 100 %
 * de los textos fijos de su rubro, y desde entonces queda publicado aunque un
 * deploy agregue textos nuevos (se ven en el idioma base y el admin avisa).
 * Se revisa cuando algo puede cambiar el avance: al guardar una traducción, al
 * traducir con IA y al elegir idiomas en Mi Tienda. Quitar un idioma de la
 * tienda lo despublica (`despublicadosAlCambiar`).
 */

/** Completo = todos sus textos fijos traducidos (sin textos que traducir, también). */
const completo = ({ total, traducidos }) => traducidos >= total;

/** Publica los idiomas elegidos que llegaron al 100 %. Devuelve los que publicó. */
export async function publicarCompletos(tiendaId) {
  const [{ publicados }, elegidos] = await Promise.all([codigosDeTienda(tiendaId), idiomasElegidos(tiendaId)]);
  const nuevos = [];
  for (const idioma of elegidos.filter((i) => !i.esBase && !publicados.includes(i.codigo))) {
    if (completo(await avanceTextos(tiendaId, idioma))) nuevos.push(idioma.codigo);
  }
  if (!nuevos.length) return [];
  await prisma.tiendas.update({ where: { id: tiendaId }, data: { idiomasPublicados: [...publicados, ...nuevos] } });
  invalidarIdiomasDeTienda();
  // El selector de la tienda sale de GET /store/tiendas (cacheado).
  invalidateTiendasStoreCache();
  return nuevos;
}

/** Publicados que quedan si la tienda pasa a ofrecer `idiomas`: quitar uno lo despublica. */
export async function despublicadosAlCambiar(tiendaId, idiomas) {
  const { publicados } = await codigosDeTienda(tiendaId);
  return publicados.filter((c) => idiomas.includes(c));
}

/**
 * Para el admin (Mi Tienda, Traducciones): cada idioma elegido con su avance.
 * `nuevos` son los textos que faltan en un idioma ya publicado: el aviso
 * "Hay N textos nuevos por traducir".
 */
export async function estadoIdiomas(tiendaId) {
  const [{ publicados }, elegidos] = await Promise.all([codigosDeTienda(tiendaId), idiomasElegidos(tiendaId)]);
  const estado = [];
  for (const idioma of elegidos.filter((i) => !i.esBase)) {
    const { total, traducidos } = await avanceTextos(tiendaId, idioma);
    const publicado = publicados.includes(idioma.codigo);
    estado.push({ idioma, publicado, total, traducidos, faltan: total - traducidos, nuevos: publicado ? total - traducidos : 0 });
  }
  return estado;
}
