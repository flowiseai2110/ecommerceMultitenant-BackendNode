import { prisma } from "../../config/prisma.js";

/**
 * Servicio de tiendas (contexto tenants/usuarios): consultas de negocio que no
 * cubre el CRUD genérico — el listado scopeado a la membresía del usuario y las
 * estadísticas agregadas del dashboard.
 */

// Campos que la tabla de administración (tienda-list) realmente renderiza.
// El detalle completo se obtiene aparte vía GET /:id al editar.
const LIST_ALLOWED_FIELDS = ["id", "nombre", "slug", "ruc", "email", "tipoNegocio", "activo"];

// Campos donde el buscador del admin debe coincidir.
const SEARCH_FIELDS = ["nombre", "slug", "ruc", "razonSocial", "email"];

/**
 * Construye el "select" de Prisma para el listado: por defecto solo lo que usa
 * la tabla; si llega ?fields=, se filtra contra el whitelist (deny by default).
 * @param {string} [fields] - Lista separada por comas.
 * @returns {object}
 */
function buildListSelect(fields) {
  const requested = fields
    ? String(fields).split(",").map(f => f.trim()).filter(Boolean)
    : LIST_ALLOWED_FIELDS;

  const allowed = requested.filter(f => LIST_ALLOWED_FIELDS.includes(f));
  const select = { id: true };
  for (const field of allowed) {
    select[field] = true;
  }
  return select;
}

/**
 * Lista SOLO las tiendas a las que el usuario pertenece (scope por membresía),
 * con búsqueda opcional y proyección de campos.
 * @param {string} userId - Usuario autenticado.
 * @param {{ page?: number, limit?: number, search?: string, fields?: string }} query
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function listTiendasForUser(userId, query = {}) {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 10, 100);

  const membresias = await prisma.usuario_tiendas.findMany({
    where: { userId, activo: true },
    select: { tiendaId: true }
  });
  const tiendaIds = membresias.map(m => m.tiendaId);

  const where = {
    id: { in: tiendaIds },
    ...(query.search ? {
      OR: SEARCH_FIELDS.map(field => ({
        [field]: { contains: query.search, mode: "insensitive" }
      }))
    } : {})
  };
  const select = buildListSelect(query.fields);

  const [data, total] = await Promise.all([
    prisma.tiendas.findMany({
      where,
      select,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { fechaRegistro: "desc" }
    }),
    prisma.tiendas.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    }
  };
}

/**
 * Estadísticas agregadas de una tienda para el dashboard. Una sola consulta con
 * subqueries correlacionadas (evita 7 round-trips a Supabase).
 * @param {string} tiendaId
 * @returns {Promise<object>} Métricas de la tienda.
 */
export async function getTiendaStats(tiendaId) {
  const [row] = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM categorias WHERE tienda_id = ${tiendaId}::uuid) AS categorias,
      (SELECT COUNT(*) FROM productos WHERE tienda_id = ${tiendaId}::uuid AND activo = true) AS productos,
      (SELECT COUNT(*) FROM pedidos WHERE tienda_id = ${tiendaId}::uuid) AS pedidos_total,
      (SELECT COUNT(*) FROM pedidos WHERE tienda_id = ${tiendaId}::uuid AND estado = 'pendiente') AS pedidos_pendientes,
      (SELECT COUNT(*) FROM clientes WHERE tienda_id = ${tiendaId}::uuid) AS clientes,
      (SELECT COUNT(*) FROM usuario_tiendas WHERE tienda_id = ${tiendaId}::uuid AND activo = true) AS miembros,
      (SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE tienda_id = ${tiendaId}::uuid) AS ventas_total
  `;

  return {
    categorias: Number(row.categorias),
    productos: Number(row.productos),
    pedidos: {
      total: Number(row.pedidos_total),
      pendientes: Number(row.pedidos_pendientes)
    },
    clientes: Number(row.clientes),
    miembros: Number(row.miembros),
    ventasTotal: parseFloat(row.ventas_total)
  };
}
