-- ============================================================================
-- RECEPCIÓN — Fase 4 (vitrina del hostal al paso)
-- Spec: docs/specs/recepcion/spec.md (R8)
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, después de recepcion_fase_3.sql.
-- Una columna con valor por defecto: ninguna tienda cambia hasta que la active.
-- Generado con `prisma migrate diff`. Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "vitrina_al_paso" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
