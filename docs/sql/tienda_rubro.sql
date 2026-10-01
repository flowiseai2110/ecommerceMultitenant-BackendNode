-- ============================================================================
-- RUBRO DE LA TIENDA — Setup
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `tiendas`: sin esta, fallan el
-- login del admin y el storefront.)
--
-- Qué vende la tienda (moda, alimentos...). Sirve para sugerir campañas de
-- temporada (docs/specs/campanas-widgets, R2.5) y, más adelante, la
-- estructura de diseño inicial. No confundir con `tipo_negocio`
-- (productos / servicios / ambos), que describe otra cosa.
--
-- Nullable: las tiendas existentes quedan sin rubro y reciben las
-- sugerencias generales hasta que el dueño lo elija.
-- Valores: modules/tenants/rubros.js (mantener ambos en sincronía).
-- ============================================================================

ALTER TABLE "tiendas"
  ADD COLUMN IF NOT EXISTS "rubro" VARCHAR(30);

ALTER TABLE "tiendas" DROP CONSTRAINT IF EXISTS "tiendas_rubro_check";
ALTER TABLE "tiendas"
  ADD CONSTRAINT "tiendas_rubro_check"
  CHECK ("rubro" IS NULL OR "rubro" IN ('general', 'moda', 'tecnologia', 'belleza', 'alimentos', 'mascotas', 'hogar'));
