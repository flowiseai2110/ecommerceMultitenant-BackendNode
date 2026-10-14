import { prisma } from "../../config/prisma.js";

/** Acceso a `textos_claves`, `textos_plataforma` y `tienda_textos` (docs/specs/idiomas D7). Sin reglas de negocio. */

/** Claves vigentes de unos grupos. */
export const clavesDeGrupos = (grupos) => prisma.textos_claves.findMany({
  where: { grupo: { in: grupos }, obsoleta: false }, select: { clave: true, grupo: true }, orderBy: { clave: "asc" }
});

/** Traducciones de la plataforma a un idioma. */
export const textosDePlataforma = (idioma) => prisma.textos_plataforma.findMany({ where: { idioma }, select: { clave: true, texto: true } });

/** Traducciones de una tienda a un idioma. */
export const textosDeTienda = (tiendaId, idioma) => prisma.tienda_textos.findMany({ where: { tiendaId, idioma }, select: { clave: true, texto: true, origen: true } });

/**
 * Escribe y borra traducciones de una tienda en una sola transacción. En bloque
 * (borrar lo que cambia o sale y volver a crear): con la BD remota, cientos de
 * UPSERT (p. ej. "Traducir con IA" de todo un grupo) pasan el tope de 5 s.
 */
export function escribirTextosDeTienda(tiendaId, idioma, { guardar, borrar }, usuario) {
  return prisma.$transaction([
    prisma.tienda_textos.deleteMany({ where: { tiendaId, idioma, clave: { in: [...guardar.map((g) => g.clave), ...borrar] } } }),
    prisma.tienda_textos.createMany({
      data: guardar.map(({ clave, texto, origen }) => ({ tiendaId, idioma, clave, texto, origen, usuarioRegistro: usuario }))
    })
  ]);
}
