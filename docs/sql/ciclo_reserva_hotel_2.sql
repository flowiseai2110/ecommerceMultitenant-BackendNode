-- ============================================================================
-- CICLO DE LA RESERVA DEL HOTEL — pieza 2 (early check-in y late check-out)
-- Spec: docs/specs/ciclo-reserva-hotel/spec.md (C7)
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, ANTES de desplegar el backend
-- que lo usa. Agrega una columna opcional al catálogo de extras del hotel:
-- marca el extra que es early check-in o late check-out para que el huésped
-- lo pida con hora y el hotel lo apruebe. No cambia datos existentes.
-- Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

ALTER TABLE "hotel_extras"
  ADD COLUMN IF NOT EXISTS "horario" VARCHAR(5);

ALTER TABLE "hotel_extras"
  ADD CONSTRAINT hotel_extras_horario CHECK ("horario" IS NULL OR "horario" IN ('early', 'late'));

COMMIT;
