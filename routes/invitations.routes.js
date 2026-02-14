import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { config } from "../config/index.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors.js";
import { getRolesUsuario, getCodigoRol, tienePermisosAdmin } from "../services/roles.service.js";
import { sendInvitationEmail } from "../services/email.service.js";
import {
  createInvitacionSchema,
  acceptInvitacionSchema,
  tokenParamSchema,
  idParamSchema,
  tiendaIdParamSchema,
  listInvitacionesQuerySchema
} from "../validators/invitaciones.validator.js";

const router = Router();

// Generar token único para invitación
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Calcular fecha de expiración (7 días por defecto)
const getExpirationDate = (days = 7) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * GET /api/invitations/tienda/:tiendaId
 * Listar invitaciones de una tienda
 */
router.get(
  "/tienda/:tiendaId",
  authMiddleware,
  validate({ params: tiendaIdParamSchema, query: listInvitacionesQuerySchema }),
  async (req, res, next) => {
    try {
      const { tiendaId } = req.params;
      const { estado, page = 1, limit = 10 } = req.validatedQuery || req.query;

      // Verificar que el usuario tiene acceso a la tienda
      const usuarioTienda = await prisma.usuario_tiendas.findFirst({
        where: {
          userId: req.user.sub,
          tiendaId: tiendaId,
          activo: true
        }
      });

      if (!usuarioTienda) {
        throw new ForbiddenError("No tienes acceso a esta tienda");
      }

      // Verificar permisos de admin usando el servicio
      const tienePermisos = await tienePermisosAdmin(usuarioTienda.rol);
      if (!tienePermisos) {
        throw new ForbiddenError("No tienes permiso para ver las invitaciones de esta tienda");
      }

      const where = { tiendaId };
      if (estado) {
        where.estado = estado;
      }

      const [invitaciones, total] = await Promise.all([
        prisma.invitaciones.findMany({
          where,
          include: {
            tienda: {
              select: { id: true, nombre: true, slug: true }
            }
          },
          orderBy: { fechaRegistro: "desc" },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.invitaciones.count({ where })
      ]);

      // Obtener roles para convertir UUIDs a códigos en las invitaciones
      const rolesEnumerados = await getRolesUsuario();

      // Mapear invitaciones con el código del rol
      const invitacionesConRol = invitaciones.map(inv => {
        const rolDetalle = rolesEnumerados.find(r => r.id === inv.rol);
        return {
          ...inv,
          rolCodigo: rolDetalle?.codigo || inv.rol
        };
      });

      res.json({
        success: true,
        invitations: invitacionesConRol,
        total
        // pagination: {
        //   page,
        //   limit,
        //   total,
        //   totalPages: Math.ceil(total / limit)
        // }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/invitations
 * Crear nueva invitación
 */
router.post(
  "/",
  authMiddleware,
  validate({ body: createInvitacionSchema }),
  async (req, res, next) => {
    try {
      const { tiendaId, email, rol, mensaje } = req.body;

      // Verificar que el usuario tiene permiso para invitar
      const usuarioTienda = await prisma.usuario_tiendas.findFirst({
        where: {
          userId: req.user.sub,
          tiendaId: tiendaId,
          activo: true
        }
      });

      if (!usuarioTienda) {
        throw new ForbiddenError("No tienes acceso a esta tienda");
      }

      // Verificar permisos de admin
      const tienePermisos = await tienePermisosAdmin(usuarioTienda.rol);
      if (!tienePermisos) {
        throw new ForbiddenError("No tienes permiso para enviar invitaciones en esta tienda");
      }

      // Obtener roles para validar jerarquía
      const rolesEnumerados = await getRolesUsuario();
      const rolUsuario = rolesEnumerados.find(r => r.id === usuarioTienda.rol);
      const rolInvitado = rolesEnumerados.find(r => r.codigo === rol);

      if (!rolInvitado) {
        throw new ValidationError("Rol inválido");
      }

      // Verificar que no se asigne un rol superior al propio
      const jerarquia = ["viewer", "editor", "admin", "owner"];
      const nivelUsuario = jerarquia.indexOf(rolUsuario?.codigo || "viewer");
      const nivelInvitado = jerarquia.indexOf(rol);

      if (nivelInvitado > nivelUsuario) {
        throw new ForbiddenError("No puedes asignar un rol superior al tuyo");
      }

      // Verificar si ya existe una invitación pendiente
      const invitacionExistente = await prisma.invitaciones.findFirst({
        where: {
          tiendaId,
          email,
          estado: "pendiente"
        }
      });

      if (invitacionExistente) {
        throw new ValidationError("Ya existe una invitación pendiente para este email");
      }

      // Obtener datos de la tienda para el email
      const tienda = await prisma.tiendas.findUnique({
        where: { id: tiendaId },
        select: { id: true, nombre: true, slug: true, logoUrl: true }
      });

      // Crear invitación con el UUID del rol
      const invitacion = await prisma.invitaciones.create({
        data: {
          tiendaId,
          email,
          rol: rolInvitado.id, // Guardar el UUID del rol
          mensaje,
          token: generateInvitationToken(),
          fechaExpiracion: getExpirationDate(7),
          estado: "pendiente",
          fechaRegistro: new Date(),
          usuarioRegistro: req.user.email || req.user.sub
        },
        include: {
          tienda: {
            select: { id: true, nombre: true, slug: true }
          }
        }
      });

      // Enviar email de invitación
      const emailResult = await sendInvitationEmail(
        { ...invitacion, rolCodigo: rol },
        tienda,
        req.user.email || req.user.sub
      );

      res.status(201).json({
        success: true,
        data: {
          ...invitacion,
          rolCodigo: rol
        },
        emailSent: emailResult.success,
        message: "Invitación creada exitosamente"
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/invitations/:id/resend
 * Reenviar invitación
 */
router.post(
  "/:id/resend",
  authMiddleware,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const invitacion = await prisma.invitaciones.findUnique({
        where: { id },
        include: { tienda: true }
      });

      if (!invitacion) {
        throw new NotFoundError("Invitación no encontrada");
      }

      // Verificar permisos
      const usuarioTienda = await prisma.usuario_tiendas.findFirst({
        where: {
          userId: req.user.sub,
          tiendaId: invitacion.tiendaId,
          activo: true
        }
      });

      if (!usuarioTienda) {
        throw new ForbiddenError("No tienes acceso a esta tienda");
      }

      const tienePermisos = await tienePermisosAdmin(usuarioTienda.rol);
      if (!tienePermisos) {
        throw new ForbiddenError("No tienes permiso para reenviar esta invitación");
      }

      if (invitacion.estado !== "pendiente") {
        throw new ValidationError("Solo se pueden reenviar invitaciones pendientes");
      }

      // Obtener datos de la tienda para el email
      const tienda = await prisma.tiendas.findUnique({
        where: { id: invitacion.tiendaId },
        select: { id: true, nombre: true, slug: true, logoUrl: true }
      });

      // Actualizar token y fecha de expiración
      const invitacionActualizada = await prisma.invitaciones.update({
        where: { id },
        data: {
          token: generateInvitationToken(),
          fechaExpiracion: getExpirationDate(7),
          fechaActualizacion: new Date(),
          usuarioActualizacion: req.user.email || req.user.sub
        },
        include: {
          tienda: {
            select: { id: true, nombre: true, slug: true }
          }
        }
      });

      // Obtener código del rol
      const rolCodigo = await getCodigoRol(invitacionActualizada.rol);

      // Reenviar email
      const emailResult = await sendInvitationEmail(
        { ...invitacionActualizada, rolCodigo },
        tienda,
        req.user.email || req.user.sub
      );

      res.json({
        success: true,
        data: {
          ...invitacionActualizada,
          rolCodigo
        },
        emailSent: emailResult.success,
        message: "Invitación reenviada exitosamente"
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/invitations/:id
 * Cancelar invitación
 */
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const invitacion = await prisma.invitaciones.findUnique({
        where: { id }
      });

      if (!invitacion) {
        throw new NotFoundError("Invitación no encontrada");
      }

      // Verificar permisos
      const usuarioTienda = await prisma.usuario_tiendas.findFirst({
        where: {
          userId: req.user.sub,
          tiendaId: invitacion.tiendaId,
          activo: true
        }
      });

      if (!usuarioTienda) {
        throw new ForbiddenError("No tienes acceso a esta tienda");
      }

      const tienePermisos = await tienePermisosAdmin(usuarioTienda.rol);
      if (!tienePermisos) {
        throw new ForbiddenError("No tienes permiso para cancelar esta invitación");
      }

      if (invitacion.estado !== "pendiente") {
        throw new ValidationError("Solo se pueden cancelar invitaciones pendientes");
      }

      // Actualizar estado a cancelada
      await prisma.invitaciones.update({
        where: { id },
        data: {
          estado: "cancelada",
          fechaActualizacion: new Date(),
          usuarioActualizacion: req.user.email || req.user.sub
        }
      });

      res.json({
        success: true,
        message: "Invitación cancelada exitosamente"
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/invitations/validate/:token
 * Validar token de invitación (público)
 */
router.get(
  "/validate/:token",
  validate({ params: tokenParamSchema }),
  async (req, res, next) => {
    try {
      const { token } = req.params;

      const invitacion = await prisma.invitaciones.findUnique({
        where: { token },
        include: {
          tienda: {
            select: { id: true, nombre: true, slug: true, logoUrl: true }
          }
        }
      });

      if (!invitacion) {
        throw new NotFoundError("Invitación no encontrada o token inválido");
      }

      // Verificar si está expirada
      if (new Date() > invitacion.fechaExpiracion) {
        if (invitacion.estado === "pendiente") {
          await prisma.invitaciones.update({
            where: { id: invitacion.id },
            data: { estado: "expirada" }
          });
        }
        throw new ValidationError("La invitación ha expirado");
      }

      if (invitacion.estado !== "pendiente") {
        throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
      }

      // Obtener código del rol
      const rolCodigo = await getCodigoRol(invitacion.rol);

      res.json({
        success: true,
        invitation: {
          id: invitacion.id,
          email: invitacion.email,
          rol: rolCodigo,
          mensaje: invitacion.mensaje,
          tienda: invitacion.tienda,
          fechaExpiracion: invitacion.fechaExpiracion,
          token:invitacion.token
        },
        valid:true
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/invitations/accept
 * Aceptar invitación y crear/vincular usuario (público)
 */
router.post(
  "/accept",
  validate({ body: acceptInvitacionSchema }),
  async (req, res, next) => {
    try {
      const { token, nombre, password } = req.body;

      const invitacion = await prisma.invitaciones.findUnique({
        where: { token },
        include: { tienda: true }
      });

      if (!invitacion) {
        throw new NotFoundError("Invitación no encontrada o token inválido");
      }

      // Verificar si está expirada
      if (new Date() > invitacion.fechaExpiracion) {
        if (invitacion.estado === "pendiente") {
          await prisma.invitaciones.update({
            where: { id: invitacion.id },
            data: { estado: "expirada" }
          });
        }
        throw new ValidationError("La invitación ha expirado");
      }

      if (invitacion.estado !== "pendiente") {
        throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
      }

      let userId;

      // Intentar crear usuario en Supabase si se proporciona password
      if (password && config.supabaseServiceKey) {
        const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.supabaseServiceKey}`,
            "apikey": config.supabaseServiceKey
          },
          body: JSON.stringify({
            email: invitacion.email,
            password: password,
            email_confirm: true,
            user_metadata: { nombre: nombre || invitacion.email.split("@")[0] }
          })
        });

        if (!response.ok) {
          const error = await response.json();
          if (error.msg?.includes("already been registered") || error.code === "email_exists") {
            throw new ValidationError("El email ya está registrado. Por favor inicia sesión para aceptar la invitación.");
          }
          throw new ValidationError(error.msg || "Error al crear usuario");
        }

        const userData = await response.json();
        userId = userData.id;
      } else if (!password) {
        throw new ValidationError("Se requiere password para crear la cuenta. Si ya tienes cuenta, inicia sesión primero.");
      }

      // Crear relación usuario-tienda (rol ya está como UUID en invitacion.rol)
      if (userId) {
        // Verificar si ya existe una relación (por si el usuario ya existía)
        const existeRelacion = await prisma.usuario_tiendas.findFirst({
          where: {
            userId: userId,
            tiendaId: invitacion.tiendaId
          }
        });

        if (existeRelacion) {
          // Actualizar el rol existente en lugar de crear duplicado
          await prisma.usuario_tiendas.update({
            where: { id: existeRelacion.id },
            data: {
              rol: invitacion.rol,
              activo: true,
              fechaActualizacion: new Date(),
              usuarioActualizacion: invitacion.email
            }
          });
        } else {
          await prisma.usuario_tiendas.create({
            data: {
              userId: userId,
              tiendaId: invitacion.tiendaId,
              rol: invitacion.rol, // UUID del rol
              activo: true,
              fechaRegistro: new Date(),
              usuarioRegistro: invitacion.email
            }
          });
        }
      }

      // Marcar invitación como aceptada
      await prisma.invitaciones.update({
        where: { id: invitacion.id },
        data: {
          estado: "aceptada",
          fechaActualizacion: new Date(),
          usuarioActualizacion: invitacion.email
        }
      });

      // Obtener código del rol para la respuesta
      const rolCodigo = await getCodigoRol(invitacion.rol);

      res.json({
        success: true,
        message: "Invitación aceptada exitosamente",
        data: {
          tienda: {
            id: invitacion.tienda.id,
            nombre: invitacion.tienda.nombre,
            slug: invitacion.tienda.slug
          },
          rol: rolCodigo
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/invitations/accept-authenticated
 * Aceptar invitación para usuario ya autenticado
 */
router.post(
  "/accept-authenticated",
  authMiddleware,
  validate({ body: z.object({ token: z.string().min(1) }) }),
  async (req, res, next) => {
    try {
      const { token } = req.body;

      const invitacion = await prisma.invitaciones.findUnique({
        where: { token },
        include: { tienda: true }
      });

      if (!invitacion) {
        throw new NotFoundError("Invitación no encontrada o token inválido");
      }

      // Verificar que el email coincide
      if (invitacion.email.toLowerCase() !== req.user.email?.toLowerCase()) {
        throw new ForbiddenError("Esta invitación no corresponde a tu email");
      }

      // Verificar si está expirada
      if (new Date() > invitacion.fechaExpiracion) {
        if (invitacion.estado === "pendiente") {
          await prisma.invitaciones.update({
            where: { id: invitacion.id },
            data: { estado: "expirada" }
          });
        }
        throw new ValidationError("La invitación ha expirado");
      }

      if (invitacion.estado !== "pendiente") {
        throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
      }

      // Verificar si ya está en la tienda
      const yaEnTienda = await prisma.usuario_tiendas.findFirst({
        where: {
          userId: req.user.sub,
          tiendaId: invitacion.tiendaId
        }
      });

      if (yaEnTienda) {
        throw new ValidationError("Ya eres miembro de esta tienda");
      }

      // Crear relación usuario-tienda (rol ya está como UUID)
      await prisma.usuario_tiendas.create({
        data: {
          userId: req.user.sub,
          tiendaId: invitacion.tiendaId,
          rol: invitacion.rol, // UUID del rol
          activo: true,
          fechaRegistro: new Date(),
          usuarioRegistro: req.user.email || req.user.sub
        }
      });

      // Marcar invitación como aceptada
      await prisma.invitaciones.update({
        where: { id: invitacion.id },
        data: {
          estado: "aceptada",
          fechaActualizacion: new Date(),
          usuarioActualizacion: req.user.email || req.user.sub
        }
      });

      // Obtener código del rol para la respuesta
      const rolCodigo = await getCodigoRol(invitacion.rol);

      res.json({
        success: true,
        message: "Invitación aceptada exitosamente",
        data: {
          tienda: {
            id: invitacion.tienda.id,
            nombre: invitacion.tienda.nombre,
            slug: invitacion.tienda.slug
          },
          rol: rolCodigo
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
