import { Router } from "express";
import { authMiddleware } from "../../kernel/tenant/index.js";
import { getUserProfile } from "./users.service.js";

const router = Router();

/**
 * GET /me/profile — Perfil del usuario autenticado.
 * IMPORTANTE: debe ir ANTES de /:userId/profile.
 * Devuelve un envelope propio (res.json), no el estándar apiResponse.
 */
router.get("/me/profile", authMiddleware, async (req, res, next) => {
  try {
    res.json(await getUserProfile(req.user.id, req.user));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:userId/profile — Perfil de un usuario específico (solo el propio).
 */
router.get("/:userId/profile", authMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Un usuario solo puede ver su propio perfil.
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: "No tienes permiso para ver este perfil"
      });
    }

    res.json(await getUserProfile(userId, req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
