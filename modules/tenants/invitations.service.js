import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { config } from "../../config/index.js";
import { logger } from "../../config/logger.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { getRolesUsuario, getCodigoRol, tienePermisosAdmin } from "../../services/roles.service.js";
import { sendInvitationEmail } from "../../services/email.service.js";
import { findActiveMembership } from "../../kernel/tenant/index.js";

/**
 * Servicio de invitaciones (contexto tenants/usuarios): alta/reenvío/cancelación
 * de invitaciones por parte de un admin de la tienda, y validación/aceptación
 * pública del token para vincular al invitado a la tienda.
 *
 * Cada método devuelve datos planos; el envelope de respuesta (propio de estos
 * endpoints, no el apiResponse estándar) lo arma la ruta.
 */

const generateInvitationToken = () => crypto.randomBytes(32).toString("hex");

const getExpirationDate = (days = 7) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const JERARQUIA = ["viewer", "editor", "admin", "owner"];

/**
 * Asegura que el usuario tenga membresía activa + permisos de admin en la tienda.
 * @param {string} userId
 * @param {string} tiendaId
 * @param {string} forbiddenMsg - Mensaje si no tiene permisos de admin.
 * @returns {Promise<object>} La membresía (usuario_tiendas).
 * @throws {ForbiddenError}
 */
async function assertTiendaAdmin(userId, tiendaId, forbiddenMsg) {
  const membership = await findActiveMembership(userId, tiendaId);
  if (!membership) {
    throw new ForbiddenError("No tienes acceso a esta tienda");
  }
  if (!(await tienePermisosAdmin(membership.rol))) {
    throw new ForbiddenError(forbiddenMsg);
  }
  return membership;
}

/**
 * Lista invitaciones de una tienda (solo admin), con el código de rol resuelto.
 * @param {{ id: string }} user
 * @param {string} tiendaId
 * @param {{ estado?: string, page?: number, limit?: number }} opts
 * @returns {Promise<{ invitations: object[], total: number }>}
 */
export async function listInvitaciones(user, tiendaId, { estado, page = 1, limit = 10 } = {}) {
  await assertTiendaAdmin(user.id, tiendaId, "No tienes permiso para ver las invitaciones de esta tienda");

  const where = { tiendaId };
  if (estado) where.estado = estado;

  const [invitaciones, total] = await Promise.all([
    prisma.invitaciones.findMany({
      where,
      include: { tienda: { select: { id: true, nombre: true, slug: true } } },
      orderBy: { fechaRegistro: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.invitaciones.count({ where })
  ]);

  const rolesEnumerados = await getRolesUsuario();
  const invitations = invitaciones.map(inv => {
    const rolDetalle = rolesEnumerados.find(r => r.id === inv.rol);
    return { ...inv, rolCodigo: rolDetalle?.codigo || inv.rol };
  });

  return { invitations, total };
}

/**
 * Crea una invitación pendiente y envía el email (el fallo de email no cancela
 * la creación).
 * @param {{ id: string, email?: string }} user
 * @param {{ tiendaId: string, email: string, rol: string, mensaje?: string }} data
 * @returns {Promise<{ invitacion: object, emailSent: boolean }>}
 */
export async function createInvitacion(user, { tiendaId, email, rol, mensaje }) {
  const membership = await assertTiendaAdmin(user.id, tiendaId, "No tienes permiso para enviar invitaciones en esta tienda");

  const rolesEnumerados = await getRolesUsuario();
  const rolUsuario = rolesEnumerados.find(r => r.id === membership.rol);
  const rolInvitado = rolesEnumerados.find(r => r.codigo === rol);

  if (!rolInvitado) {
    throw new ValidationError("Rol inválido");
  }

  // No se puede asignar un rol superior al propio.
  const nivelUsuario = JERARQUIA.indexOf(rolUsuario?.codigo || "viewer");
  const nivelInvitado = JERARQUIA.indexOf(rol);
  if (nivelInvitado > nivelUsuario) {
    throw new ForbiddenError("No puedes asignar un rol superior al tuyo");
  }

  const invitacionExistente = await prisma.invitaciones.findFirst({
    where: { tiendaId, email, estado: "pendiente" }
  });
  if (invitacionExistente) {
    throw new ValidationError("Ya existe una invitación pendiente para este email");
  }

  const tienda = await prisma.tiendas.findUnique({
    where: { id: tiendaId },
    select: { id: true, nombre: true, slug: true, logoUrl: true }
  });

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
      usuarioRegistro: user.email || user.id
    },
    include: { tienda: { select: { id: true, nombre: true, slug: true } } }
  });

  let emailResult = { success: false };
  try {
    emailResult = await sendInvitationEmail({ ...invitacion, rolCodigo: rol }, tienda, user.email || user.id);
  } catch (emailError) {
    logger.error("Error enviando email de invitación:", emailError.message);
  }

  return { invitacion: { ...invitacion, rolCodigo: rol }, emailSent: emailResult.success };
}

/**
 * Reenvía una invitación pendiente: renueva token y expiración, reenvía email.
 * @param {{ id: string, email?: string }} user
 * @param {string} id - ID de la invitación.
 * @returns {Promise<{ invitacion: object, emailSent: boolean }>}
 */
export async function resendInvitacion(user, id) {
  const invitacion = await prisma.invitaciones.findUnique({
    where: { id },
    include: { tienda: true }
  });
  if (!invitacion) {
    throw new NotFoundError("Invitación no encontrada");
  }

  await assertTiendaAdmin(user.id, invitacion.tiendaId, "No tienes permiso para reenviar esta invitación");

  if (invitacion.estado !== "pendiente") {
    throw new ValidationError("Solo se pueden reenviar invitaciones pendientes");
  }

  const tienda = await prisma.tiendas.findUnique({
    where: { id: invitacion.tiendaId },
    select: { id: true, nombre: true, slug: true, logoUrl: true }
  });

  const invitacionActualizada = await prisma.invitaciones.update({
    where: { id },
    data: {
      token: generateInvitationToken(),
      fechaExpiracion: getExpirationDate(7),
      fechaActualizacion: new Date(),
      usuarioActualizacion: user.email || user.id
    },
    include: { tienda: { select: { id: true, nombre: true, slug: true } } }
  });

  const rolCodigo = await getCodigoRol(invitacionActualizada.rol);

  let emailResult = { success: false };
  try {
    emailResult = await sendInvitationEmail({ ...invitacionActualizada, rolCodigo }, tienda, user.email || user.id);
  } catch (emailError) {
    logger.error("Error reenviando email de invitación:", emailError.message);
  }

  return { invitacion: { ...invitacionActualizada, rolCodigo }, emailSent: emailResult.success };
}

/**
 * Cancela una invitación pendiente (estado → "cancelada").
 * @param {{ id: string, email?: string }} user
 * @param {string} id - ID de la invitación.
 * @returns {Promise<void>}
 */
export async function cancelInvitacion(user, id) {
  const invitacion = await prisma.invitaciones.findUnique({ where: { id } });
  if (!invitacion) {
    throw new NotFoundError("Invitación no encontrada");
  }

  await assertTiendaAdmin(user.id, invitacion.tiendaId, "No tienes permiso para cancelar esta invitación");

  if (invitacion.estado !== "pendiente") {
    throw new ValidationError("Solo se pueden cancelar invitaciones pendientes");
  }

  await prisma.invitaciones.update({
    where: { id },
    data: {
      estado: "cancelada",
      fechaActualizacion: new Date(),
      usuarioActualizacion: user.email || user.id
    }
  });
}

/**
 * Valida un token de invitación (público). Marca como "expirada" si venció.
 * @param {string} token
 * @returns {Promise<object>} Datos de la invitación para la pantalla de aceptación.
 */
export async function validateToken(token) {
  const invitacion = await prisma.invitaciones.findUnique({
    where: { token },
    include: { tienda: { select: { id: true, nombre: true, slug: true, logoUrl: true } } }
  });

  if (!invitacion) {
    throw new NotFoundError("Invitación no encontrada o token inválido");
  }

  if (new Date() > invitacion.fechaExpiracion) {
    if (invitacion.estado === "pendiente") {
      await prisma.invitaciones.update({ where: { id: invitacion.id }, data: { estado: "expirada" } });
    }
    throw new ValidationError("La invitación ha expirado");
  }

  if (invitacion.estado !== "pendiente") {
    throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
  }

  const rolCodigo = await getCodigoRol(invitacion.rol);

  return {
    id: invitacion.id,
    email: invitacion.email,
    rol: rolCodigo,
    mensaje: invitacion.mensaje,
    tienda: invitacion.tienda,
    fechaExpiracion: invitacion.fechaExpiracion,
    token: invitacion.token
  };
}

/**
 * Carga y valida (no expirada, pendiente) una invitación por token.
 * @param {string} token
 * @returns {Promise<object>} Invitación con su tienda.
 */
async function loadPendingInvitacion(token) {
  const invitacion = await prisma.invitaciones.findUnique({
    where: { token },
    include: { tienda: true }
  });

  if (!invitacion) {
    throw new NotFoundError("Invitación no encontrada o token inválido");
  }
  if (new Date() > invitacion.fechaExpiracion) {
    if (invitacion.estado === "pendiente") {
      await prisma.invitaciones.update({ where: { id: invitacion.id }, data: { estado: "expirada" } });
    }
    throw new ValidationError("La invitación ha expirado");
  }
  if (invitacion.estado !== "pendiente") {
    throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
  }
  return invitacion;
}

/**
 * Formatea la respuesta común de aceptación.
 * @param {object} invitacion
 * @returns {Promise<{ tienda: object, rol: string }>}
 */
async function aceptacionResponse(invitacion) {
  const rolCodigo = await getCodigoRol(invitacion.rol);
  return {
    tienda: {
      id: invitacion.tienda.id,
      nombre: invitacion.tienda.nombre,
      slug: invitacion.tienda.slug
    },
    rol: rolCodigo
  };
}

/**
 * Acepta una invitación (público): crea el usuario en Supabase (si se envía
 * password) y lo vincula a la tienda con el rol invitado.
 * @param {{ token: string, nombre?: string, password?: string }} data
 * @returns {Promise<{ tienda: object, rol: string }>}
 */
export async function acceptInvitacion({ token, nombre, password }) {
  const invitacion = await loadPendingInvitacion(token);

  let userId;

  // Crear usuario en Supabase si se proporciona password.
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

  // Vincular usuario-tienda (rol ya está como UUID en invitacion.rol).
  if (userId) {
    const existeRelacion = await prisma.usuario_tiendas.findFirst({
      where: { userId, tiendaId: invitacion.tiendaId }
    });

    if (existeRelacion) {
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
          userId,
          tiendaId: invitacion.tiendaId,
          rol: invitacion.rol,
          activo: true,
          fechaRegistro: new Date(),
          usuarioRegistro: invitacion.email
        }
      });
    }
  }

  await prisma.invitaciones.update({
    where: { id: invitacion.id },
    data: {
      estado: "aceptada",
      fechaActualizacion: new Date(),
      usuarioActualizacion: invitacion.email
    }
  });

  return aceptacionResponse(invitacion);
}

/**
 * Acepta una invitación para un usuario ya autenticado (el email debe coincidir).
 * @param {{ id: string, email?: string }} user
 * @param {string} token
 * @returns {Promise<{ tienda: object, rol: string }>}
 */
export async function acceptInvitacionAuthenticated(user, token) {
  const invitacion = await prisma.invitaciones.findUnique({
    where: { token },
    include: { tienda: true }
  });

  if (!invitacion) {
    throw new NotFoundError("Invitación no encontrada o token inválido");
  }

  if (invitacion.email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new ForbiddenError("Esta invitación no corresponde a tu email");
  }

  if (new Date() > invitacion.fechaExpiracion) {
    if (invitacion.estado === "pendiente") {
      await prisma.invitaciones.update({ where: { id: invitacion.id }, data: { estado: "expirada" } });
    }
    throw new ValidationError("La invitación ha expirado");
  }

  if (invitacion.estado !== "pendiente") {
    throw new ValidationError(`La invitación ya fue ${invitacion.estado}`);
  }

  const yaEnTienda = await prisma.usuario_tiendas.findFirst({
    where: { userId: user.id, tiendaId: invitacion.tiendaId }
  });
  if (yaEnTienda) {
    throw new ValidationError("Ya eres miembro de esta tienda");
  }

  await prisma.usuario_tiendas.create({
    data: {
      userId: user.id,
      tiendaId: invitacion.tiendaId,
      rol: invitacion.rol,
      activo: true,
      fechaRegistro: new Date(),
      usuarioRegistro: user.email || user.id
    }
  });

  await prisma.invitaciones.update({
    where: { id: invitacion.id },
    data: {
      estado: "aceptada",
      fechaActualizacion: new Date(),
      usuarioActualizacion: user.email || user.id
    }
  });

  return aceptacionResponse(invitacion);
}
