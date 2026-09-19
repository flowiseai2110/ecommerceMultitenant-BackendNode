import { prisma } from "../../config/prisma.js";

/**
 * Acceso de solo lectura a la membresía usuario↔tienda, usado por los guards de
 * autorización multi-tenant. Es la fuente única de verdad para "¿este usuario
 * pertenece a esta tienda?": antes esta consulta estaba duplicada en
 * requireTiendaAccess y en el guard inline de las tareas de IA.
 *
 * Nota: el CRUD de usuario_tiendas (invitar, cambiar rol, desactivar) vive en el
 * módulo tenants/usuarios; esto es solo la lectura que necesitan los guards.
 */

/**
 * Devuelve la membresía activa de un usuario en una tienda, o null si no existe.
 * @param {string} userId - ID del usuario (Supabase Auth).
 * @param {string} tiendaId - ID de la tienda.
 * @returns {Promise<object|null>} Fila de usuario_tiendas o null.
 */
export async function findActiveMembership(userId, tiendaId) {
  return prisma.usuario_tiendas.findFirst({
    where: { userId, tiendaId, activo: true }
  });
}
