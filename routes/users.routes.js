import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getRolesUsuario } from "../services/roles.service.js";

const router = Router();

/**
 * Matriz de permisos por rol
 * Basado en la tabla de permisos del sistema
 */
const PERMISOS_POR_ROL = {
  owner: {
    // Datos
    verDatos: true,
    // Productos
    crearProductos: true,
    editarProductos: true,
    eliminarProductos: true,
    // Pedidos
    gestionarPedidos: true,
    // Configuración
    configurarTienda: true,
    configurarPagos: true,
    configurarEnvios: true,
    // Equipo
    invitarUsuarios: true,
    cambiarRoles: true,
    eliminarUsuarios: true,
    // Tienda
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
 * Obtiene los permisos según el código del rol
 */
function getPermisosPorRol(rolCodigo) {
  return PERMISOS_POR_ROL[rolCodigo] || PERMISOS_POR_ROL.viewer;
}

/**
 * GET /api/users/me/profile
 * Obtiene el perfil del usuario autenticado
 * IMPORTANTE: Esta ruta debe estar ANTES de /:userId/profile
 */
router.get("/me/profile", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log("userId-->",userId);
    // Obtener las tiendas del usuario con sus roles
    const usuarioTiendas = await prisma.usuario_tiendas.findMany({
      where: {
        userId: userId,
        activo: true
      },
      include: {
        tienda: true
      }
    });
    console.log("DLQ->usuarioTiendas--->",usuarioTiendas);
    // Obtener roles desde enumerados (con cache)
    const rolesEnumerados = await getRolesUsuario();

    // Construir respuesta
    const response = {
      user: {
        id: req.user.id,
        email: req.user.email,
        nombre: req.user.user_metadata?.nombre || req.user.user_metadata?.full_name || null,
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
  
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:userId/profile
 * Obtiene el perfil de un usuario específico (solo el propio)
 */
router.get("/:userId/profile", authMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Verificar que el usuario autenticado solo pueda ver su propio perfil
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: "No tienes permiso para ver este perfil"
      });
    }

    // Obtener las tiendas del usuario con sus roles
    const usuarioTiendas = await prisma.usuario_tiendas.findMany({
      where: {
        userId: userId,
        activo: true
      },
      include: {
        tienda: true
      }
    });

    // Obtener roles desde enumerados (con cache)
    const rolesEnumerados = await getRolesUsuario();

    // Construir respuesta
    const response = {
      user: {
        id: req.user.id,
        email: req.user.email,
        nombre: req.user.user_metadata?.nombre || req.user.user_metadata?.full_name || null,
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

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
