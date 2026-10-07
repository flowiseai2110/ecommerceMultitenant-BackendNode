-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Fase 2 (plan Privado con Cloudflare Stream)
-- Spec: docs/specs/transmision-eventos (plan.md, Fase 2)
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de transmisiones_setup.sql, en el SQL Editor de Supabase.
-- Se puede correr más de una vez (sección 0). El DDL de la sección 1 se generó
-- con `prisma migrate diff` desde el schema. Después: `npx prisma generate`.
--
-- No borra transmisiones ni invitaciones: solo agrega columnas y tablas.
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS transmision_vinculaciones     CASCADE;
DROP TABLE IF EXISTS transmision_eventos_proveedor CASCADE;
ALTER TABLE evento_transmisiones DROP CONSTRAINT IF EXISTS transmision_senal_valida;
ALTER TABLE evento_transmisiones DROP CONSTRAINT IF EXISTS transmision_tope_valido;
ALTER TABLE evento_transmisiones DROP CONSTRAINT IF EXISTS transmision_privado_completo;
ALTER TABLE evento_transmisiones
  DROP COLUMN IF EXISTS clave_cifrada, DROP COLUMN IF EXISTS clave_version, DROP COLUMN IF EXISTS entrada_id,
  DROP COLUMN IF EXISTS factor, DROP COLUMN IF EXISTS habilitada, DROP COLUMN IF EXISTS inicio_real_en,
  DROP COLUMN IF EXISTS limpiada_en, DROP COLUMN IF EXISTS max_invitados, DROP COLUMN IF EXISTS minutos_descontados,
  DROP COLUMN IF EXISTS minutos_usados, DROP COLUMN IF EXISTS proveedor, DROP COLUMN IF EXISTS prueba_hasta,
  DROP COLUMN IF EXISTS senal, DROP COLUMN IF EXISTS senal_en, DROP COLUMN IF EXISTS terminada_en;
ALTER TABLE evento_invitaciones DROP COLUMN IF EXISTS sesion_id, DROP COLUMN IF EXISTS sesion_vista_en;
ALTER TABLE planes DROP CONSTRAINT IF EXISTS planes_horas_transmision;
ALTER TABLE planes DROP COLUMN IF EXISTS horas_transmision_mes;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "planes" ADD COLUMN     "horas_transmision_mes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "evento_transmisiones" ADD COLUMN     "clave_cifrada" TEXT,
ADD COLUMN     "clave_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "entrada_id" VARCHAR(64),
ADD COLUMN     "factor" DECIMAL(3,1),
ADD COLUMN     "habilitada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inicio_real_en" TIMESTAMPTZ,
ADD COLUMN     "limpiada_en" TIMESTAMPTZ,
ADD COLUMN     "max_invitados" INTEGER,
ADD COLUMN     "minutos_descontados" INTEGER,
ADD COLUMN     "minutos_usados" INTEGER,
ADD COLUMN     "proveedor" VARCHAR(20),
ADD COLUMN     "prueba_hasta" TIMESTAMPTZ,
ADD COLUMN     "senal" VARCHAR(20) NOT NULL DEFAULT 'sin_senal',
ADD COLUMN     "senal_en" TIMESTAMPTZ,
ADD COLUMN     "terminada_en" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "evento_invitaciones" ADD COLUMN     "sesion_id" VARCHAR(40),
ADD COLUMN     "sesion_vista_en" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "transmision_eventos_proveedor" (
    "id" UUID NOT NULL,
    "proveedor" VARCHAR(20) NOT NULL,
    "evento_id" VARCHAR(120) NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "entrada_id" VARCHAR(64),
    "payload" JSONB,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmision_eventos_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmision_vinculaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "codigo_hash" VARCHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ NOT NULL,
    "usado_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),

    CONSTRAINT "transmision_vinculaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transmision_eventos_proveedor_proveedor_evento_id_key" ON "transmision_eventos_proveedor"("proveedor", "evento_id");

-- CreateIndex
CREATE UNIQUE INDEX "transmision_vinculaciones_codigo_hash_key" ON "transmision_vinculaciones"("codigo_hash");

-- CreateIndex
CREATE INDEX "idx_transmision_vinculaciones_transmision" ON "transmision_vinculaciones"("transmision_id");

-- AddForeignKey
ALTER TABLE "transmision_vinculaciones" ADD CONSTRAINT "transmision_vinculaciones_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE planes
  ADD CONSTRAINT planes_horas_transmision CHECK (horas_transmision_mes BETWEEN 0 AND 500);

ALTER TABLE evento_transmisiones
  ADD CONSTRAINT transmision_senal_valida    CHECK (senal IN ('sin_senal', 'conectada', 'desconectada')),
  ADD CONSTRAINT transmision_tope_valido     CHECK ((max_invitados IS NULL AND factor IS NULL)
                                                    OR (max_invitados, factor) IN ((25, 0.5), (50, 1), (100, 2), (200, 4))),
  ADD CONSTRAINT transmision_privado_completo CHECK (plan = 'basico'
                                                    OR (proveedor IS NOT NULL AND entrada_id IS NOT NULL AND max_invitados IS NOT NULL));

-- 3) Horas incluidas por plan (decisión 2026-10-06): Free 0, Starter 0, Pro 3, Business 6
UPDATE planes SET horas_transmision_mes = CASE codigo WHEN 'pro' THEN 3 WHEN 'business' THEN 6 ELSE 0 END;

-- 4) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
ALTER TABLE transmision_eventos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmision_vinculaciones     ENABLE ROW LEVEL SECURITY;

COMMIT;
