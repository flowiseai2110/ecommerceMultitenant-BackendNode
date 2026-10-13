-- ============================================================================
-- HOTEL ANTES DE LLEGAR (docs/specs/plantillas-por-rubro, E8)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `reservas`: sin estas fallan las reservas.)
--
--   reservas.checkin_online     { horaLlegada, comentarios, completadoEn }
--   reservas.cambio_solicitado  { fecha, noches, total, diferencia, disponible, motivo, comentario, solicitadoEn }
-- ============================================================================

ALTER TABLE "reservas" ADD COLUMN IF NOT EXISTS "checkin_online" JSONB;
ALTER TABLE "reservas" ADD COLUMN IF NOT EXISTS "cambio_solicitado" JSONB;
