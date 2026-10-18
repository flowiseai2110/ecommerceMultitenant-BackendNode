-- ============================================================================
-- QUITAR EL CORREO AUTOMÁTICO "¿CÓMO TE FUE?" (2026-10-18)
-- Spec: docs/specs/hospedaje-completo/spec.md C6
-- ----------------------------------------------------------------------------
-- Ya no se le pide la reseña al huésped por correo: la reseña nace de él, desde
-- la tienda. La columna que marcaba ese correo queda sin uso.
--
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de desplegar el backend
-- sin el job (antes, el backend en producción todavía la usa). Borra solo esa
-- columna: no toca reservas ni reseñas.
-- ============================================================================

BEGIN;

ALTER TABLE "reservas" DROP COLUMN IF EXISTS "resena_pedida_en";

COMMIT;
