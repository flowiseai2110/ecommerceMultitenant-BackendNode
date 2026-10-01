/**
 * Tool `buscar_productos` — Fase 1 del asesor de ventas IA.
 *
 * Es la ÚNICA fuente de verdad de catálogo del asesor. El modelo nunca recibe el
 * catálogo en el prompt: solo puede recomendar lo que esta herramienta devuelve.
 *
 * Aislamiento multi-tenant: `tiendaId` se INYECTA server-side (viene de
 * `resolveTienda`), NUNCA del input del modelo. La query siempre filtra por él,
 * así que es imposible que el asesor vea productos de otra tienda.
 *
 * @see modules/agente/arquitectura.md — §2 (tool-use) y §6 (Fase 1).
 */

import { prisma, Prisma } from "../../../config/prisma.js";
import MemoryCache from "../../../utils/memory-cache.js";

// Máximo de productos que la tool devuelve por búsqueda. El panel del chat es
// angosto (no hay espacio útil para más tarjetas) y cada producto de más es
// tokens pagados en el tool_result — 4 alcanza para que el modelo recomiende
// sin inflar el costo por turno.
const MAX_RESULTADOS = 4;

// word_similarity mínimo para aceptar un producto solo por parecido (typos como
// "sapatilla"). Por debajo de ~0.5 empiezan a colarse palabras que no tienen
// nada que ver.
const UMBRAL_TYPO = 0.5;

// Cuánto pesa el parecido por typo frente al ts_rank del full-text search.
// Punto de partida, calibrar con consultas reales.
const PESO_TYPO = 0.3;

// Categorías y colores cambian poco y se piden en cada turno del chat: se
// cachean por tienda para no sumar round-trips a Supabase por mensaje. Un color
// recién cargado en el admin aparece en el chat como mucho a los 5 minutos.
const cacheFacetas = new MemoryCache({ max: 500 });
const TTL_FACETAS_MS = 5 * 60 * 1000;

/**
 * Valores por los que se puede filtrar en esta tienda: sus categorías activas y
 * los colores que realmente usan sus productos activos.
 * @param {string} tiendaId
 * @returns {Promise<{
 *   categorias: Array<{id:string, nombre:string, categoriaPadreId:string|null}>,
 *   colores: string[]
 * }>}
 */
export async function obtenerFacetas(tiendaId) {
  const cached = cacheFacetas.get(tiendaId);
  if (cached) return cached;

  const [categorias, filasColores] = await Promise.all([
    prisma.categorias.findMany({
      where: { tiendaId, activo: true },
      select: { id: true, nombre: true, categoriaPadreId: true },
      orderBy: { orden: "asc" }
    }),
    prisma.$queryRaw`
      SELECT DISTINCT unnest(colores) AS color
      FROM productos
      WHERE tienda_id = ${tiendaId}::uuid AND activo = true
      ORDER BY color
    `
  ]);

  const facetas = { categorias, colores: filasColores.map(f => f.color) };
  cacheFacetas.set(tiendaId, facetas, TTL_FACETAS_MS);
  return facetas;
}

/**
 * Definición de la tool tal como la ve el modelo (contrato de entrada). Se arma
 * por tienda: los `enum` de `categoria` y `color` son sus valores reales, así el
 * modelo elige de una lista en vez de adivinar nombres.
 * El `tiendaId` NO está aquí a propósito: lo pone el backend, no el modelo.
 * @param {{ categorias: Array<{nombre:string}>, colores: string[] }} facetas
 */
export function buildBuscarProductosToolDef({ categorias, colores }) {
  const nombres = [...new Set(categorias.map(c => c.nombre))];

  const properties = {
    query: {
      type: "string",
      description:
        "Texto de búsqueda: tipo de producto y características que pide el cliente. " +
        "Ej: 'zapatillas running', 'polo talla M', 'audífonos bluetooth'."
    },
    precioMax: {
      type: "number",
      description: "Precio máximo en soles. Opcional; úsalo si el cliente pone un presupuesto."
    },
    soloConStock: {
      type: "boolean",
      description: "Si es true, solo devuelve productos con stock disponible. Por defecto true."
    }
  };

  if (nombres.length > 0) {
    properties.categoria = {
      type: "string",
      enum: nombres,
      description:
        "Categoría de la tienda a la que pertenece lo que busca el cliente. Úsala solo " +
        "cuando lo que pide calce claramente con una (ej: 'para hombre' → la categoría de " +
        "hombre si existe). Si dudas, no la pongas: filtrar mal deja al cliente sin resultados."
    };
  }

  if (colores.length > 0) {
    properties.color = {
      type: "string",
      enum: colores,
      description:
        "Color que pide el cliente, elegido de los colores que tiene la tienda. Mapea " +
        "sinónimos y género gramatical al valor de la lista ('negras' → 'negro', " +
        "'café' → 'marron'). Solo devuelve productos que tienen ese color cargado."
    };
  }

  const filtraColor = colores.length > 0
    ? "Puede filtrar por color. "
    : "Esta tienda no tiene colores cargados: revisa nombre y descripción para confirmarlo. ";

  return {
    name: "buscar_productos",
    description:
      "Busca productos en el catálogo de ESTA tienda por nombre, descripción y categoría. " +
      "Úsala siempre que el cliente pregunte por un producto, categoría, precio o " +
      "disponibilidad. Devuelve hasta 4 productos ordenados por relevancia, con su " +
      "categoría, colores y descripción corta. " + filtraColor +
      "Solo puedes mencionar o recomendar productos que esta herramienta devuelva; " +
      "si no hay resultados, dilo con honestidad y no inventes.",
    input_schema: {
      type: "object",
      properties,
      required: ["query"]
    }
  };
}

/**
 * Ids de la categoría elegida más sus subcategorías: pedir "Hombre" también
 * debe traer lo que está en "Hombre > Running".
 */
function idsDeCategoria(nombre, categorias) {
  const buscado = nombre.trim().toLowerCase();
  const ids = new Set(categorias.filter(c => c.nombre.toLowerCase() === buscado).map(c => c.id));

  let agregado = ids.size > 0;
  while (agregado) {
    agregado = false;
    for (const c of categorias) {
      if (c.categoriaPadreId && ids.has(c.categoriaPadreId) && !ids.has(c.id)) {
        ids.add(c.id);
        agregado = true;
      }
    }
  }
  return [...ids];
}

/**
 * Ejecuta la búsqueda contra Postgres, siempre scoped a `tiendaId`.
 *
 * @param {object} params
 * @param {string} params.tiendaId - Inyectado server-side (req.tiendaId). Obligatorio.
 * @param {object} params.input - Input del modelo ({ query, precioMax?, soloConStock?, categoria?, color? }).
 * @param {object} params.facetas - Categorías y colores de la tienda (de obtenerFacetas).
 * @returns {Promise<{ productos: Array }>} Productos listos para tarjeta (modelo + frontend).
 */
export async function ejecutarBuscarProductos({ tiendaId, input, facetas }) {
  if (!tiendaId) {
    // Guarda de seguridad: sin tiendaId no se ejecuta ninguna búsqueda.
    throw new Error("buscar_productos: falta tiendaId (scope multi-tenant).");
  }

  const query = typeof input?.query === "string" ? input.query.trim() : "";
  const precioMax = typeof input?.precioMax === "number" ? input.precioMax : null;
  // Por defecto solo mostramos con stock; el modelo puede pedir lo contrario.
  const soloConStock = input?.soloConStock !== false;

  // $queryRaw no pasa por el auto-scope de Prisma: el tienda_id va explícito.
  const filtros = [Prisma.sql`p.tienda_id = ${tiendaId}::uuid`, Prisma.sql`p.activo = true`];
  if (precioMax !== null) filtros.push(Prisma.sql`p.precio_base <= ${precioMax}`);
  if (soloConStock) filtros.push(Prisma.sql`p.stock > 0`);
  // Una categoría o color que no es de esta tienda se ignora (se busca sin ese filtro).
  if (typeof input?.categoria === "string") {
    const idsCategoria = idsDeCategoria(input.categoria, facetas.categorias);
    if (idsCategoria.length > 0) {
      filtros.push(Prisma.sql`p.categoria_id = ANY(${idsCategoria}::uuid[])`);
    }
  }
  const color = typeof input?.color === "string" ? input.color.trim().toLowerCase() : "";
  if (facetas.colores.includes(color)) {
    filtros.push(Prisma.sql`${color} = ANY(p.colores)`);
  }

  const palabras = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const coincide = query
    ? Prisma.sql`(s.fts > 0 OR s.typo > 0)`
    : Prisma.sql`true`;

  // Full-text search con la config `spanish`: su stemmer une plural/singular y
  // quita tildes ("zapatillas" y "Zapatilla" → 'zapatill'). Los términos se
  // combinan con OR y ts_rank ordena por cuántos coinciden, así un producto que
  // calza "zapatilla + running + hombre" le gana a uno que solo calza "zapatilla".
  // word_similarity (pg_trgm, ver docs/sql/agente_busqueda.sql) cubre los typos.
  const productos = await prisma.$queryRaw`
    WITH q AS (
      SELECT replace(plainto_tsquery('spanish', ${query})::text, ' & ', ' | ')::tsquery AS tsq
    ),
    s AS (
      SELECT p.id,
        ts_rank(
          setweight(to_tsvector('spanish', p.nombre), 'A') ||
          setweight(to_tsvector('spanish', array_to_string(p.etiquetas, ' ')), 'A') ||
          setweight(to_tsvector('spanish', coalesce(p.descripcion_corta, '')), 'B'),
          q.tsq
        ) AS fts,
        t.typo
      FROM productos p
      CROSS JOIN q
      -- Suma el parecido de cada palabra que pase el umbral: "sapatilla mujeres"
      -- debe preferir el producto que se parece en las dos palabras, no solo en una.
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(sim) FILTER (WHERE sim >= ${UMBRAL_TYPO}), 0) AS typo
        FROM (
          SELECT extensions.word_similarity(w, lower(p.nombre)) AS sim
          FROM unnest(${palabras}::text[]) AS w
        ) x
      ) t
      WHERE ${Prisma.join(filtros, " AND ")}
    )
    SELECT p.id, p.nombre, p.slug, p.precio_base AS "precioBase",
           p.precio_oferta AS "precioOferta", p.stock,
           p.descripcion_corta AS "descripcionCorta", cat.nombre AS categoria, p.colores,
           img.url AS "imagenUrl", img.texto_alternativo AS "imagenAlt"
    FROM s
    JOIN productos p ON p.id = s.id
    LEFT JOIN categorias cat ON cat.id = p.categoria_id
    LEFT JOIN LATERAL (
      SELECT url, texto_alternativo
      FROM producto_imagenes
      WHERE producto_id = p.id AND es_principal = true
      LIMIT 1
    ) img ON true
    WHERE ${coincide}
    ORDER BY s.fts + ${PESO_TYPO} * s.typo DESC, p.destacado DESC, p.fecha_registro DESC
    LIMIT ${MAX_RESULTADOS}
  `;

  return { productos };
}
