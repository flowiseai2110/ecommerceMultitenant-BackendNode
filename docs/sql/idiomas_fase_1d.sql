-- ============================================================================
-- IDIOMAS — Fase 1d (un texto fijo puede ser de varios grupos)
-- Spec: docs/specs/idiomas (diseno.md "Grupos exactos") · Tareas: tasks.md 1.22b
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de idiomas_fase_1c.sql
-- y ANTES de desplegar el backend que lee `grupos`. Después: `npx prisma generate`.
--
-- Hasta ahora cada clave tenía UN grupo; si se usaba en varios rubros, se
-- subía a uno general (`comun`, `reservas`). Así un hotel tenía que traducir
-- "Antes de salir" (de productos y de tours) para publicar un idioma, aunque
-- su tienda nunca lo muestra. Ahora la clave guarda todos sus grupos y una
-- tienda traduce las que tienen alguno de los suyos.
--
-- El backfill copia el grupo actual; el backend, al arrancar, carga los grupos
-- exactos del catálogo (solo puede quitar textos pedidos, nunca agregar: ningún
-- idioma publicado queda incompleto).
--
-- Sin índice GIN: la tabla tiene ~1.100 filas y la consulta de una tienda está
-- cacheada; un recorrido secuencial es más barato que el índice a este tamaño.
-- ============================================================================

BEGIN;

ALTER TABLE "textos_claves" ADD COLUMN "grupos" TEXT[];
UPDATE "textos_claves" SET "grupos" = ARRAY["grupo"]::TEXT[];
ALTER TABLE "textos_claves" ALTER COLUMN "grupos" SET NOT NULL;
ALTER TABLE "textos_claves" ADD CONSTRAINT textos_claves_grupos CHECK (cardinality("grupos") > 0);
ALTER TABLE "textos_claves" DROP COLUMN "grupo";

COMMIT;

-- Verificación: ninguna fila sin grupos y el reparto actual.
SELECT g AS grupo, count(*) AS claves
FROM "textos_claves", unnest("grupos") AS g
WHERE NOT "obsoleta"
GROUP BY g
ORDER BY g;
