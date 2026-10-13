-- ============================================================================
-- PLANTILLAS POR RUBRO: datos chicos (docs/specs/plantillas-por-rubro, E5)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `tours` y `local_salones`: sin estas,
-- fallan las fichas de tours y de salones.)
--
--   tours.mapa_url          link de Google Maps del punto de encuentro
--   tours.dificultad        facil | moderado | exigente (filtro y ficha)
--   local_salones.aforo_sentados  personas sentadas (banquete); el aforo de la
--                                 licencia (aforo_maximo) es de pie (cóctel)
-- ============================================================================

ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "mapa_url" VARCHAR(500);
ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "dificultad" VARCHAR(15);
ALTER TABLE "tours" DROP CONSTRAINT IF EXISTS "tours_dificultad_check";
ALTER TABLE "tours" ADD CONSTRAINT "tours_dificultad_check"
  CHECK ("dificultad" IS NULL OR "dificultad" IN ('facil', 'moderado', 'exigente'));

ALTER TABLE "local_salones" ADD COLUMN IF NOT EXISTS "aforo_sentados" INTEGER;
ALTER TABLE "local_salones" DROP CONSTRAINT IF EXISTS "local_salones_aforo_sentados_check";
ALTER TABLE "local_salones" ADD CONSTRAINT "local_salones_aforo_sentados_check"
  CHECK ("aforo_sentados" IS NULL OR ("aforo_sentados" > 0 AND "aforo_sentados" <= "aforo_maximo"));

-- Verificar:
--   select column_name from information_schema.columns
--   where (table_name = 'tours' and column_name in ('mapa_url', 'dificultad'))
--      or (table_name = 'local_salones' and column_name = 'aforo_sentados');  → 3 filas
