-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Mejoras (Fase A y resumen con IA a pedido)
-- Spec: docs/specs/transmision-eventos/mejoras.md
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de transmisiones_fase5.sql, en el SQL Editor de Supabase, y
-- ANTES de desplegar el backend que usa estas columnas. Después: `npx prisma generate`.
-- Se puede correr más de una vez (sección 0). Solo agrega columnas y una tabla.
--
-- - senal_verificada_en: el job no consulta la señal por API si un aviso de
--   Cloudflare la confirmó hace menos de 3 min (límite de llamadas, A3).
-- - senal_error / senal_error_en: el código de live_input.errored, para decirle
--   en español a quien transmite qué corregir (A2).
-- - resumen_pedido_en / resumen_pedido_por: la IA solo corre cuando alguien
--   aprieta "Generar resumen" (decisión 2026-10-15).
-- - transmision_avisos_plataforma: cada aviso de almacenamiento sale una sola
--   vez (clave única), aunque corran varias réplicas (A1).
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS transmision_avisos_plataforma CASCADE;
ALTER TABLE evento_transmisiones
  DROP COLUMN IF EXISTS senal_verificada_en, DROP COLUMN IF EXISTS senal_error, DROP COLUMN IF EXISTS senal_error_en,
  DROP COLUMN IF EXISTS resumen_pedido_en, DROP COLUMN IF EXISTS resumen_pedido_por;

-- 1) Columnas y tabla nuevas ---------------------------------------------------
ALTER TABLE "evento_transmisiones"
  ADD COLUMN "senal_verificada_en" TIMESTAMPTZ,
  ADD COLUMN "senal_error" VARCHAR(40),
  ADD COLUMN "senal_error_en" TIMESTAMPTZ,
  ADD COLUMN "resumen_pedido_en" TIMESTAMPTZ,
  ADD COLUMN "resumen_pedido_por" VARCHAR(100);

CREATE TABLE "transmision_avisos_plataforma" (
    "id" UUID NOT NULL,
    "clave" VARCHAR(80) NOT NULL,
    "detalle" JSONB,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmision_avisos_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transmision_avisos_plataforma_clave_key" ON "transmision_avisos_plataforma"("clave");

-- 2) Resúmenes ya pedidos antes de este cambio ---------------------------------
-- Antes el job generaba el resumen solo. Los que ya se generaron (o se están
-- generando) quedan como pedidos por el sistema, para que el admin no ofrezca
-- el botón otra vez. Los que nunca empezaron (NULL) esperan el botón.
UPDATE evento_transmisiones
SET resumen_pedido_en = COALESCE(resumen_generado_en, fecha_actualizacion, NOW()),
    resumen_pedido_por = 'automático (antes del botón)'
WHERE resumen_estado IS NOT NULL;

-- 3) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
ALTER TABLE transmision_avisos_plataforma ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación
SELECT count(*) FILTER (WHERE resumen_pedido_en IS NOT NULL) AS resumenes_ya_pedidos,
       count(*) FILTER (WHERE plan = 'premium' AND resumen_estado IS NULL AND terminada_en IS NOT NULL) AS premium_esperando_boton
FROM evento_transmisiones;
