import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { apiResponse } from "../../utils/apiResponse.js";
import { z } from "zod";
import { ValidationError } from "../../utils/errors.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { scopeQueryToTienda } from "../../kernel/tenant/index.js";
import { conPrecioSql } from "./productos.vitrina.js";
import { serializeMarcaStore } from "./marcas.serializer.js";

const querySchema = z.object({
  tiendaId: z.string().uuid("ID de tienda inválido").optional()
}).passthrough();

const router = Router();

// GET / - Marcas para el filtro del catálogo (público). Solo las activas que tienen
// al menos un producto visible: una marca sin productos dejaría el filtro vacío.
// Tienda del subdominio, o ?tiendaId= como fallback (resolveTienda).
router.get("/", validate({ query: querySchema }), scopeQueryToTienda, async (req, res, next) => {
  try {
    const { tiendaId } = req.validatedQuery || req.query;
    if (!tiendaId) throw new ValidationError("El ID de tienda es requerido");

    const filas = await prisma.$queryRaw`
      SELECT m.id, m.nombre, m.slug, m.logo_url AS "logoUrl"
      FROM marcas m
      WHERE m.tienda_id = ${tiendaId}::uuid AND m.activo = true
        AND EXISTS (
          SELECT 1 FROM productos p
          WHERE p.marca_id = m.id AND p.tienda_id = m.tienda_id AND p.activo = true AND ${conPrecioSql()}
        )
      ORDER BY m.orden ASC, m.nombre ASC
    `;
    return apiResponse(res, { status: 200, type: "SUCCESS", code: "MARCAS_FOUND", data: filas.map(serializeMarcaStore) });
  } catch (error) {
    next(error);
  }
});

export default router;
