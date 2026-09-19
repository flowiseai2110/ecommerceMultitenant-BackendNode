import { prisma } from "../../config/prisma.js";
import { getRolesUsuario } from "../../services/roles.service.js";

/**
 * Servicio de perfil de usuario (contexto tenants/usuarios). Resuelve las
 * tiendas del usuario, su rol en cada una y los permisos derivados de ese rol.
 */

/**
 * Matriz de permisos por rol. Basada en la tabla de permisos del sistema.
 */
const PERMISOS_POR_ROL = {
  owner: {
    verDatos: true,
    crearProductos: true,
    editarProductos: true,
    eliminarProductos: true,
    gestionarPedidos: true,
    configurarTienda: true,
    configurarPagos: true,
    configurarEnvios: true,
    invitarUsuarios: true,
    cambiarRoles: true,
    eliminarUsuarios: true,
    eliminarTienda: true
  },
  admin: {
    verDatos: true,
    crearProductos: true,
    editarProductos: true,
    eliminarProductos: true,
    gestionarPedidos: true,
    configurarTienda: true,
    configurarPagos: true,
    configurarEnvios: true,
    invitarUsuarios: true,
    cambiarRoles: false,
    eliminarUsuarios: false,
    eliminarTienda: false
  },
  editor: {
    verDatos: true,
    crearProductos: true,
    editarProductos: true,
    eliminarProductos: false,
    gestionarPedidos: true,
    configurarTienda: false,
    configurarPagos: false,
    configurarEnvios: false,
    invitarUsuarios: false,
    cambiarRoles: false,
    eliminarUsuarios: false,
    eliminarTienda: false
  },
  viewer: {
    verDatos: true,
    crearProductos: false,
    editarProductos: false,
    eliminarProductos: false,
    gestionarPedidos: false,
    configurarTienda: false,
    configurarPagos: false,
    configurarEnvios: false,
    invitarUsuarios: false,
    cambiarRoles: false,
    eliminarUsuarios: false,
    eliminarTienda: false
  }
};

/**
 * Obtiene los permisos según el código del rol (cae a viewer si es desconocido).
 * @param {string} rolCodigo
 * @returns {object}
 */
function getPermisosPorRol(rolCodigo) {
  return PERMISOS_POR_ROL[rolCodigo] || PERMISOS_POR_ROL.viewer;
}

/**
 * Construye el perfil del usuario autenticado: sus tiendas, rol y permisos.
 * Devuelve el objeto de respuesta tal cual lo espera el frontend (envelope
 * propio, no el estándar apiResponse).
 * @param {string} userId - ID del usuario cuyas membresías se consultan.
 * @param {{ id: string, email: string, metadata?: object }} user - Usuario autenticado (req.user).
 * @returns {Promise<{ user: object }>}
 */
export async function getUserProfile(userId, user) {
  const usuarioTiendas = await prisma.usuario_tiendas.findMany({
    where: { userId, activo: true },
    select: {
      tiendaId: true,
      rol: true,
      tienda: {
        select: { id: true, nombre: true, slug: true, descripcion: true, logoUrl: true, activo: true }
      }
    }
  });

  const rolesEnumerados = await getRolesUsuario();

  return {
    user: {
      id: user.id,
      email: user.email,
      nombre: user.metadata?.nombre || user.metadata?.full_name || null,
      tiendas: usuarioTiendas.map(ut => {
        const detalleRol = rolesEnumerados.find(e => e.id === ut.rol);
        const rolCodigo = detalleRol?.codigo || "viewer";
        return {
          tiendaId: ut.tiendaId,
          rol: rolCodigo,
          permisos: getPermisosPorRol(rolCodigo),
          tienda: {
            id: ut.tienda.id,
            nombre: ut.tienda.nombre,
            slug: ut.tienda.slug,
            descripcion: ut.tienda.descripcion,
            logoUrl: ut.tienda.logoUrl,
            activo: ut.tienda.activo
          }
        };
      })
    }
  };
}
