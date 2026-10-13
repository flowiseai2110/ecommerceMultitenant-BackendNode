-- ============================================================================
-- PAGO AUTOMÁTICO: Setup (docs/specs/pago-automatico R1)
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `tiendas`: sin esta, fallan el
-- login del admin y el storefront.)
--
-- Cómo cobra la tienda:
--   manual     → el cliente sube la captura y el negocio verifica (lo de hoy)
--   automatico → pasarela de pagos; la confirmación es inmediata
-- Las tiendas existentes quedan en "manual".
-- ============================================================================

ALTER TABLE "tiendas"
  ADD COLUMN IF NOT EXISTS "modo_pago" VARCHAR(15) NOT NULL DEFAULT 'manual';

ALTER TABLE "tiendas" DROP CONSTRAINT IF EXISTS "tiendas_modo_pago_check";
ALTER TABLE "tiendas"
  ADD CONSTRAINT "tiendas_modo_pago_check"
  CHECK ("modo_pago" IN ('manual', 'automatico'));

-- Verificar:
--   select modo_pago, count(*) from tiendas group by modo_pago;  → manual | N
