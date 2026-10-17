-- ============================================================================
-- CICLO DE LA RESERVA DEL HOTEL — pieza 1
-- Spec: docs/specs/ciclo-reserva-hotel/spec.md
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, ANTES de desplegar el backend
-- que lo usa. Solo agrega columnas con valor por defecto: no cambia los datos
-- de ninguna tienda. El estado nuevo `hospedada` va en `pedidos.estado`
-- (texto libre): no necesita cambios.
-- Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Reservas: código del PMS, entrada y salida reales, notas, cancelación ---
ALTER TABLE "reservas"
  ADD COLUMN IF NOT EXISTS "codigo_pms"  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "checkin_en"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "checkout_en" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "notas"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "cancelacion" JSONB,
  ADD COLUMN IF NOT EXISTS "retenido"    DECIMAL(10,2);

-- Buscar por el código del PMS dentro de una tienda.
CREATE INDEX IF NOT EXISTS "idx_reservas_tienda_codigo_pms" ON "reservas"("tienda_id", "codigo_pms");

-- 2) Política de cancelación del hotel --------------------------------------
ALTER TABLE "config_reservas"
  ADD COLUMN IF NOT EXISTS "cancelacion_gratis_horas" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS "penalidad_noches"         INTEGER NOT NULL DEFAULT 1;

-- 3) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE "config_reservas"
  ADD CONSTRAINT config_reservas_cancelacion_gratis CHECK ("cancelacion_gratis_horas" BETWEEN 0 AND 720),
  ADD CONSTRAINT config_reservas_penalidad_noches   CHECK ("penalidad_noches" BETWEEN 0 AND 30);
ALTER TABLE "reservas"
  ADD CONSTRAINT reservas_notas_es_lista CHECK (jsonb_typeof("notas") = 'array');

COMMIT;
