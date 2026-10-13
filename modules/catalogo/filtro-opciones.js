import { prisma } from "../../config/prisma.js";

/**
 * Filtro por opciones de variante en el catálogo (docs/specs/plantillas-por-rubro E9):
 * ?opcion=Talla:M,Talla:L,Color:Negro → productos con alguna variante activa,
 * con stock, que sea (M o L) y Negro. Dentro de una opción es O; entre opciones, Y.
 * Los valores vienen de `producto_variantes.atributos` ({ Talla: "M", Color: "Negro" }).
 */

const MAX_GRUPOS = 3;
const MAX_VALORES = 30;

/** "Talla:M,Talla:L,Color:Negro" → [{ nombre: "Talla", valores: ["M","L"] }, { nombre: "Color", valores: ["Negro"] }] */
export function parsearOpciones(texto) {
  const grupos = new Map();
  for (const parte of String(texto ?? "").split(",")) {
    const i = parte.indexOf(":");
    if (i <= 0) continue;
    const nombre = parte.slice(0, i).trim().slice(0, 40);
    const valor = parte.slice(i + 1).trim().slice(0, 60);
    if (!nombre || !valor) continue;
    if (!grupos.has(nombre)) {
      if (grupos.size >= MAX_GRUPOS) continue;
      grupos.set(nombre, []);
    }
    const valores = grupos.get(nombre);
    if (valores.length < MAX_VALORES && !valores.includes(valor)) valores.push(valor);
  }
  return [...grupos].map(([nombre, valores]) => ({ nombre, valores }));
}

/** Where de Prisma para `productos` (null si no hay nada que filtrar). */
export function whereOpciones(texto) {
  const grupos = parsearOpciones(texto);
  if (!grupos.length) return null;
  return {
    variantes: {
      some: {
        activo: true,
        stock: { gt: 0 },
        AND: grupos.map(g => ({ OR: g.valores.map(v => ({ atributos: { path: [g.nombre], equals: v } })) }))
      }
    }
  };
}

/**
 * Facetas para el panel de filtros: las opciones (y valores) de los productos
 * activos de la tienda o de unas categorías, en el orden en que aparecen.
 * Solo los valores con alguna variante en stock.
 */
export async function facetasOpciones(tiendaId, categoriaIds = []) {
  const productos = await prisma.productos.findMany({
    where: {
      tiendaId, activo: true,
      ...(categoriaIds.length ? { categoriaId: { in: categoriaIds } } : {}),
      variantes: { some: { activo: true, stock: { gt: 0 } } }
    },
    select: { metadata: true, variantes: { where: { activo: true, stock: { gt: 0 } }, select: { atributos: true } } },
    take: 2000
  });
  const facetas = new Map();
  for (const p of productos) {
    const opciones = Array.isArray(p.metadata?.opciones) ? p.metadata.opciones : [];
    for (const o of opciones) {
      if (!o || typeof o.nombre !== "string") continue;
      if (!facetas.has(o.nombre)) facetas.set(o.nombre, { nombre: o.nombre, tipo: o.tipo === "color" ? "color" : "texto", valores: [] });
      const f = facetas.get(o.nombre);
      for (const v of p.variantes) {
        const valor = v.atributos?.[o.nombre];
        if (typeof valor === "string" && !f.valores.includes(valor)) f.valores.push(valor);
      }
    }
  }
  // Una opción con un solo valor no sirve para filtrar.
  return [...facetas.values()].filter(f => f.valores.length > 1).slice(0, MAX_GRUPOS);
}
