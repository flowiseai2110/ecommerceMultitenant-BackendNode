-- ============================================================================
-- CONSUMO IA (asesor de ventas + asistente "Guía") — Setup
-- ----------------------------------------------------------------------------
-- Corre este script UNA vez en el SQL Editor de Supabase ANTES de desplegar
-- el backend que lo usa. Después: `npx prisma generate`.
-- (Prisma selecciona todas las columnas de `planes` y `tienda_uso_recursos`:
-- sin estas, fallan las consultas que las leen.)
--
-- Unidad de cara al emprendedor: CONSULTAS (1 mensaje = 1 consulta).
-- Los tokens se guardan solo para que la plataforma vea su costo real.
--
-- - planes.limite_consultas_*_mes: tope mensual del plan. NULL = ilimitado.
-- - tienda_uso_recursos: una fila por (tienda, recurso, mes). Recursos nuevos:
--   'consultas_asesor_ia' y 'consultas_asistente_ia'. El dueño puede BAJAR el
--   tope en tienda_configuraciones (clave 'consumo_ia'), nunca subirlo.
-- - aviso_enviado_en: el correo de "te acercas al límite" se manda una sola
--   vez por mes y recurso.
--
-- Costo aproximado por mes (Haiku 4.5, sin cache):
--   SELECT recurso, periodo, SUM(cantidad_usada) consultas,
--          ROUND((SUM(tokens_entrada) * 1 + SUM(tokens_salida) * 5) / 1e6, 2) usd
--   FROM tienda_uso_recursos WHERE recurso LIKE 'consultas_%' GROUP BY 1, 2;
-- ============================================================================

ALTER TABLE "planes"
  ADD COLUMN IF NOT EXISTS "limite_consultas_asesor_mes" INTEGER,
  ADD COLUMN IF NOT EXISTS "limite_consultas_asistente_mes" INTEGER;

ALTER TABLE "tienda_uso_recursos"
  ADD COLUMN IF NOT EXISTS "tokens_entrada" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tokens_salida" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aviso_enviado_en" TIMESTAMPTZ;

-- El consumo se reserva con INSERT ... ON CONFLICT: necesita el índice único.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tienda_recurso_periodo"
  ON "tienda_uso_recursos" ("tienda_id", "recurso", "periodo");

-- Topes por plan (placeholders, mismos valores que prisma/seed-planes.js).
UPDATE "planes" SET "limite_consultas_asesor_mes" = 100,  "limite_consultas_asistente_mes" = 50  WHERE "codigo" = 'free';
UPDATE "planes" SET "limite_consultas_asesor_mes" = 1000, "limite_consultas_asistente_mes" = 200 WHERE "codigo" = 'starter';
UPDATE "planes" SET "limite_consultas_asesor_mes" = 5000, "limite_consultas_asistente_mes" = 500 WHERE "codigo" = 'pro';
-- business: NULL (ilimitado)

-- ----------------------------------------------------------------------------
-- Tope DIARIO de la Guía (además del mensual): frena que alguien gaste el mes
-- en un día. Fila por (tienda, 'consultas_asistente_ia_dia', 'YYYY-MM-DD'),
-- por eso `periodo` pasa de 7 a 10 caracteres (ampliar no toca datos ni el
-- índice único). Sin plan: CONSUMO_IA_LIMITE_ASISTENTE_DIA_SIN_PLAN (40).
-- Idempotente: se puede correr aunque la parte de arriba ya se haya aplicado.
-- ----------------------------------------------------------------------------
ALTER TABLE "tienda_uso_recursos" ALTER COLUMN "periodo" TYPE VARCHAR(10);

ALTER TABLE "planes"
  ADD COLUMN IF NOT EXISTS "limite_consultas_asistente_dia" INTEGER;

UPDATE "planes" SET "limite_consultas_asistente_dia" = 40  WHERE "codigo" = 'free';
UPDATE "planes" SET "limite_consultas_asistente_dia" = 100 WHERE "codigo" = 'starter';
UPDATE "planes" SET "limite_consultas_asistente_dia" = 250 WHERE "codigo" = 'pro';
-- business: NULL (sin tope diario)
