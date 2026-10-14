-- ============================================================================
-- IDIOMAS — Fase 1c (los idiomas de la tienda salen de la tabla `idiomas`)
-- Spec: docs/specs/idiomas (D1) · Tareas: tasks.md 1.20
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de idiomas_fase_1b.sql.
--
-- hospedaje_fase_c.sql dejó `tiendas_idiomas` con la lista fija ['es','en']:
-- con ella ninguna tienda puede elegir quechua, aymara ni un idioma que el
-- admin de la plataforma agregue después. Se reemplaza por la única regla que
-- no depende de la lista: el idioma base (es) siempre está. Que cada código
-- exista y esté activo en `idiomas` lo valida el backend al guardar
-- (validarIdiomasDeTienda): un CHECK no puede consultar otra tabla.
-- No cambia datos. No requiere `prisma generate`.
-- ============================================================================

BEGIN;

ALTER TABLE "tiendas" DROP CONSTRAINT IF EXISTS tiendas_idiomas;
ALTER TABLE "tiendas" ADD CONSTRAINT tiendas_idiomas CHECK ('es' = ANY ("idiomas"));

COMMIT;

-- Verificación: debe mostrar CHECK (('es'::text = ANY (idiomas)))
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.tiendas'::regclass AND conname = 'tiendas_idiomas';
