import { prisma } from "../config/prisma.js";

/**
 * Obtiene todos los roles de usuario desde enumerados.
 * Son solo 4 registros — no justifica cache en proceso único.
 * @returns {Promise<Array>} Lista de roles
 */
export async function getRolesUsuario() {
  return await prisma.enumerados.findMany({
    where: { tipo: "rol_usuario", activo: true },
    orderBy: { orden: "asc" }
  });
}

/**
 * Obtiene el código del rol a partir del ID (UUID)
 * @param {string} rolId - UUID del rol en enumerados
 * @returns {Promise<string>} Código del rol (owner, admin, editor, viewer)
 */
export async function getCodigoRol(rolId) {
  if (!rolId) return "viewer";

  const roles = await getRolesUsuario();
  const rol = roles.find(r => r.id === rolId);
  return rol?.codigo || "viewer";
}

/**
 * Obtiene el ID del rol a partir del código
 * @param {string} codigo - Código del rol (owner, admin, editor, viewer)
 * @returns {Promise<string|null>} UUID del rol o null
 */
export async function getIdRolByCodigo(codigo) {
  if (!codigo) return null;

  const roles = await getRolesUsuario();
  const rol = roles.find(r => r.codigo === codigo);
  return rol?.id || null;
}

/**
 * Verifica si un rol tiene permisos de administración (owner o admin)
 * @param {string} rolId - UUID del rol
 * @returns {Promise<boolean>}
 */
export async function tienePermisosAdmin(rolId) {
  const codigo = await getCodigoRol(rolId);
  return ["owner", "admin"].includes(codigo);
}

/**
 * Compara jerarquía de roles
 * @param {string} rolId1 - UUID del primer rol
 * @param {string} rolId2 - UUID del segundo rol
 * @returns {Promise<number>} 1 si rol1 > rol2, -1 si rol1 < rol2, 0 si iguales
 */
export async function compararRoles(rolId1, rolId2) {
  const jerarquia = ["viewer", "editor", "admin", "owner"];
  const codigo1 = await getCodigoRol(rolId1);
  const codigo2 = await getCodigoRol(rolId2);

  const nivel1 = jerarquia.indexOf(codigo1);
  const nivel2 = jerarquia.indexOf(codigo2);

  if (nivel1 > nivel2) return 1;
  if (nivel1 < nivel2) return -1;
  return 0;
}

export default {
  getRolesUsuario,
  getCodigoRol,
  getIdRolByCodigo,
  tienePermisosAdmin,
  compararRoles
};
