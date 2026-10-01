-- ============================================================================
-- PRODUCTOS — Colores del producto
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor (idempotente).
-- Después: `npx prisma generate`.
--
-- Valores de una paleta fija (COLORES_PRODUCTO en productos.schema.js), en
-- minúsculas y sin tildes, para que el asesor IA pueda filtrar "negro" sin
-- depender de cómo lo escribió cada comerciante.
-- ============================================================================

ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "colores" TEXT[] NOT NULL DEFAULT '{}';
