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

import { prisma } from "../../../config/prisma.js";

// Máximo de productos que la tool devuelve por búsqueda. Suficiente para que el
// modelo elija qué recomendar sin inflar el contexto ni el costo por tokens.
const MAX_RESULTADOS = 8;

/**
 * Definición de la tool tal como la ve el modelo (contrato de entrada).
 * El `tiendaId` NO está aquí a propósito: lo pone el backend, no el modelo.
 */
export const buscarProductosToolDef = {
  name: "buscar_productos",
  description:
    "Busca productos en el catálogo de ESTA tienda por nombre o características. " +
    "Úsala siempre que el cliente pregunte por un producto, categoría, precio o " +
    "disponibilidad. Solo puedes mencionar o recomendar productos que esta " +
    "herramienta devuelva; si no hay resultados, dilo con honestidad y no inventes.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Texto de búsqueda: nombre o características del producto que pide el cliente. " +
          "Ej: 'zapatillas rojas', 'polo talla M', 'audífonos bluetooth'."
      },
      precioMax: {
        type: "number",
        description: "Precio máximo en soles. Opcional; úsalo si el cliente pone un presupuesto."
      },
      soloConStock: {
        type: "boolean",
        description: "Si es true, solo devuelve productos con stock disponible. Por defecto true."
      }
    },
    required: ["query"]
  }
};

/**
 * Ejecuta la búsqueda contra Postgres, siempre scoped a `tiendaId`.
 *
 * @param {object} params
 * @param {string} params.tiendaId - Inyectado server-side (req.tiendaId). Obligatorio.
 * @param {object} params.input - Input del modelo ({ query, precioMax?, soloConStock? }).
 * @returns {Promise<{ productos: Array }>} Productos listos para tarjeta (modelo + frontend).
 */
export async function ejecutarBuscarProductos({ tiendaId, input }) {
  if (!tiendaId) {
    // Guarda de seguridad: sin tiendaId no se ejecuta ninguna búsqueda.
    throw new Error("buscar_productos: falta tiendaId (scope multi-tenant).");
  }

  const query = typeof input?.query === "string" ? input.query.trim() : "";
  const precioMax = typeof input?.precioMax === "number" ? input.precioMax : null;
  // Por defecto solo mostramos con stock; el modelo puede pedir lo contrario.
  const soloConStock = input?.soloConStock !== false;

  const where = {
    tiendaId,
    activo: true
  };

  if (query) {
    where.OR = [
      { nombre: { contains: query, mode: "insensitive" } },
      { descripcionCorta: { contains: query, mode: "insensitive" } },
      { etiquetas: { has: query } }
    ];
  }
  if (precioMax !== null) {
    where.precioBase = { lte: precioMax };
  }
  if (soloConStock) {
    where.stock = { gt: 0 };
  }

  const productos = await prisma.productos.findMany({
    where,
    take: MAX_RESULTADOS,
    orderBy: [{ destacado: "desc" }, { fechaRegistro: "desc" }],
    select: {
      id: true,
      nombre: true,
      slug: true,
      precioBase: true,
      precioOferta: true,
      stock: true,
      imagenes: {
        where: { esPrincipal: true },
        take: 1,
        select: { url: true, textoAlternativo: true }
      }
    }
  });

  // Se aplana la imagen principal a un campo simple para la tarjeta.
  return {
    productos: productos.map(p => ({
      id: p.id,
      nombre: p.nombre,
      slug: p.slug,
      precioBase: p.precioBase,
      precioOferta: p.precioOferta,
      stock: p.stock,
      imagenUrl: p.imagenes[0]?.url ?? null,
      imagenAlt: p.imagenes[0]?.textoAlternativo ?? null
    }))
  };
}
