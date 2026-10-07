-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Fase 4 (grabación, descarga y "Guardar 1 año")
-- Spec: docs/specs/transmision-eventos (plan.md, Fase 4)
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de transmisiones_fase3.sql, en el SQL Editor de Supabase.
-- Se puede correr más de una vez (sección 0). El DDL de la sección 1 se generó
-- con `prisma migrate diff` desde el schema. Después: `npx prisma generate`.
--
-- ⚠️ La sección 0 borra grabaciones y cargos registrados si ya existieran (no
-- los videos en Cloudflare). No toca transmisiones ni invitaciones.
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS transmision_grabaciones CASCADE;
DROP TABLE IF EXISTS transmision_cargos      CASCADE;
ALTER TABLE evento_transmisiones
  DROP COLUMN IF EXISTS grabar, DROP COLUMN IF EXISTS guardar_anio, DROP COLUMN IF EXISTS aviso_grabacion_en,
  DROP COLUMN IF EXISTS aviso_borrado_en, DROP COLUMN IF EXISTS aviso_descarga_en, DROP COLUMN IF EXISTS grabacion_borrada_en;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "evento_transmisiones" ADD COLUMN     "aviso_borrado_en" TIMESTAMPTZ,
ADD COLUMN     "aviso_descarga_en" TIMESTAMPTZ,
ADD COLUMN     "aviso_grabacion_en" TIMESTAMPTZ,
ADD COLUMN     "grabacion_borrada_en" TIMESTAMPTZ,
ADD COLUMN     "grabar" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "guardar_anio" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "transmision_grabaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "video_id" VARCHAR(64) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "grabada_en" TIMESTAMPTZ NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'procesando',
    "duracion_seg" INTEGER,
    "mp4_estado" VARCHAR(20) NOT NULL DEFAULT 'sin_pedir',
    "r2_key" VARCHAR(300),
    "r2_bytes" BIGINT,
    "r2_copiada_en" TIMESTAMPTZ,
    "borrada_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ,

    CONSTRAINT "transmision_grabaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmision_cargos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'por_cobrar',
    "autorizado_por" VARCHAR(100) NOT NULL,
    "autorizado_en" TIMESTAMPTZ NOT NULL,
    "cobrado_en" TIMESTAMPTZ,
    "referencia_cobro" VARCHAR(120),
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "transmision_cargos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transmision_grabaciones_video_id_key" ON "transmision_grabaciones"("video_id");

-- CreateIndex
CREATE INDEX "idx_transmision_grabaciones_transmision" ON "transmision_grabaciones"("transmision_id");

-- CreateIndex
CREATE INDEX "idx_transmision_grabaciones_estado" ON "transmision_grabaciones"("estado", "mp4_estado");

-- CreateIndex
CREATE INDEX "idx_transmision_cargos_tienda" ON "transmision_cargos"("tienda_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "transmision_cargos_transmision_id_tipo_key" ON "transmision_cargos"("transmision_id", "tipo");

-- AddForeignKey
ALTER TABLE "transmision_grabaciones" ADD CONSTRAINT "transmision_grabaciones_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmision_cargos" ADD CONSTRAINT "transmision_cargos_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE transmision_grabaciones
  ADD CONSTRAINT grabacion_estado_valido CHECK (estado IN ('procesando', 'lista', 'error', 'borrada')),
  ADD CONSTRAINT grabacion_mp4_valido    CHECK (mp4_estado IN ('sin_pedir', 'pendiente', 'lista', 'error'));

ALTER TABLE transmision_cargos
  ADD CONSTRAINT cargo_tipo_valido   CHECK (tipo IN ('guardar_anio')),
  ADD CONSTRAINT cargo_estado_valido CHECK (estado IN ('por_cobrar', 'cobrado', 'anulado')),
  ADD CONSTRAINT cargo_monto_valido  CHECK (monto >= 0);

-- Las transmisiones Privadas que ya terminaron se limpiaron como "Solo en vivo"
-- (Fase 2): no tienen grabación que mostrar.
UPDATE evento_transmisiones SET grabar = false WHERE plan <> 'basico' AND terminada_en IS NOT NULL;

-- 3) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
ALTER TABLE transmision_grabaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmision_cargos      ENABLE ROW LEVEL SECURITY;

COMMIT;
