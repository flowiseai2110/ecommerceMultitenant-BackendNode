import { Router } from "express";
import { authMiddleware } from "../../kernel/tenant/index.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
  createInvitacionSchema,
  acceptInvitacionSchema,
  acceptAuthenticatedSchema,
  tokenParamSchema,
  idParamSchema,
  tiendaIdParamSchema,
  listInvitacionesQuerySchema
} from "./invitations.schema.js";
import {
  listInvitaciones,
  createInvitacion,
  resendInvitacion,
  cancelInvitacion,
  validateToken,
  acceptInvitacion,
  acceptInvitacionAuthenticated
} from "./invitations.service.js";

const router = Router();

// NOTA: este router se monta bajo /admin, que aplica authMiddleware a TODAS sus
// rutas. Por eso /validate y /accept, pese a no declararlo por-handler, también
// requieren un JWT válido — se preserva ese comportamiento tal cual estaba.

// GET /tienda/:tiendaId — Listar invitaciones de una tienda (solo admin)
router.get(
  "/tienda/:tiendaId",
  authMiddleware,
  validate({ params: tiendaIdParamSchema, query: listInvitacionesQuerySchema }),
  async (req, res, next) => {
    try {
      const { invitations, total } = await listInvitaciones(
        req.user,
        req.params.tiendaId,
        req.validatedQuery || req.query
      );
      res.json({ success: true, invitations, total });
    } catch (error) {
      next(error);
    }
  }
);

// POST / — Crear nueva invitación
router.post(
  "/",
  authMiddleware,
  validate({ body: createInvitacionSchema }),
  async (req, res, next) => {
    try {
      const { invitacion, emailSent } = await createInvitacion(req.user, req.body);
      res.status(201).json({
        success: true,
        data: invitacion,
        emailSent,
        message: "Invitación creada exitosamente"
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/resend — Reenviar invitación
router.post(
  "/:id/resend",
  authMiddleware,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      const { invitacion, emailSent } = await resendInvitacion(req.user, req.params.id);
      res.json({
        success: true,
        data: invitacion,
        emailSent,
        message: "Invitación reenviada exitosamente"
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /:id — Cancelar invitación
router.delete(
  "/:id",
  authMiddleware,
  validate({ params: idParamSchema }),
  async (req, res, next) => {
    try {
      await cancelInvitacion(req.user, req.params.id);
      res.json({ success: true, message: "Invitación cancelada exitosamente" });
    } catch (error) {
      next(error);
    }
  }
);

// GET /validate/:token — Validar token de invitación
router.get(
  "/validate/:token",
  validate({ params: tokenParamSchema }),
  async (req, res, next) => {
    try {
      const invitation = await validateToken(req.params.token);
      res.json({ success: true, invitation, valid: true });
    } catch (error) {
      next(error);
    }
  }
);

// POST /accept — Aceptar invitación y crear/vincular usuario
router.post(
  "/accept",
  validate({ body: acceptInvitacionSchema }),
  async (req, res, next) => {
    try {
      const data = await acceptInvitacion(req.body);
      res.json({ success: true, message: "Invitación aceptada exitosamente", data });
    } catch (error) {
      next(error);
    }
  }
);

// POST /accept-authenticated — Aceptar invitación para usuario ya autenticado
router.post(
  "/accept-authenticated",
  authMiddleware,
  validate({ body: acceptAuthenticatedSchema }),
  async (req, res, next) => {
    try {
      const data = await acceptInvitacionAuthenticated(req.user, req.body.token);
      res.json({ success: true, message: "Invitación aceptada exitosamente", data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
