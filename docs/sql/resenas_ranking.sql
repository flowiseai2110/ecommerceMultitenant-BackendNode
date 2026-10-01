-- ============================================================================
-- RESEÑAS — Puntaje para ordenar por "Mejor valorados"
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de resenas_setup.sql (una sola vez, en el SQL Editor).
-- Después: `npx prisma generate`.
--
-- rating_score = promedio bayesiano: (C·m + suma_estrellas) / (C + cantidad),
-- con m = 4 y C = 3 (ver resenas.service.js). Evita que un 5.0 con 1 reseña
-- supere a un 4.9 con 40. Sin reseñas aprobadas = 0 (al final de la lista).
-- ============================================================================

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "rating_score" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill por si ya hay reseñas aprobadas.
UPDATE "productos" p
SET "rating_score" = ROUND(((3 * 4.0 + r.suma) / (3 + r.n))::numeric, 4)
FROM (
  SELECT "producto_id", SUM("estrellas") AS suma, COUNT(*) AS n
  FROM "resenas"
  WHERE "estado" = 'aprobada'
  GROUP BY "producto_id"
) r
WHERE p."id" = r."producto_id";

-- Orden del catálogo: WHERE tienda_id = ? ORDER BY rating_score DESC, rating_cantidad DESC, id
CREATE INDEX IF NOT EXISTS "idx_productos_tienda_rating"
  ON "productos"("tienda_id", "rating_score" DESC);
