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

/**
 * ¿El usuario es miembro activo de al menos una tienda? Distingue a un
 * comerciante (que entra al admin por invitación) de un comprador que solo
 * tiene cuenta porque inició sesión con Google en el storefront.
 * @param {string} userId - ID del usuario (Supabase Auth).
 * @returns {Promise<boolean>}
 */
export async function hasAnyActiveMembership(userId) {
  const membership = await prisma.usuario_tiendas.findFirst({
    where: { userId, activo: true },
    select: { id: true }
  });
  return !!membership;
}
