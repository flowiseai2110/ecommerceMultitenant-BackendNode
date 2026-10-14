-- ============================================================================
-- IDIOMAS — Fase 1b (idiomas publicados: P5 refinada)
-- Spec: docs/specs/idiomas ("Decisiones tomadas durante el diseño") · Tareas: tasks.md 1.4
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de idiomas_fase_1.sql.
-- Agrega `tiendas.idiomas_publicados`: un idioma se publica al llegar al 100 %
-- de sus textos fijos y sigue visible aunque después aparezcan textos nuevos.
--
-- Backfill: las tiendas que HOY muestran inglés nacen con el inglés publicado,
-- para que nada cambie para sus clientes. La sección 1 se generó con
-- `prisma migrate diff`. Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Columna (DDL exacto de Prisma) --------------------------------------------
-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "idiomas_publicados" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2) Backfill: lo que cada tienda ya ofrece, salvo el idioma base --------------
UPDATE "tiendas"
SET "idiomas_publicados" = ARRAY(SELECT i FROM unnest("idiomas") AS i WHERE i <> 'es')
WHERE EXISTS (SELECT 1 FROM unnest("idiomas") AS i WHERE i <> 'es');

COMMIT;

-- 3) Verificación ----------------------------------------------------------------
-- Las tiendas con otro idioma además del español, con lo publicado.
SELECT slug, idiomas, idiomas_publicados
FROM "tiendas"
WHERE cardinality("idiomas") > 1
ORDER BY slug;
