-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Fase 5 (Premium: retransmisión y resumen con IA)
-- Spec: docs/specs/transmision-eventos (plan.md, Fase 5)
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de transmisiones_fase4.sql, en el SQL Editor de Supabase.
-- Se puede correr más de una vez (sección 0). El DDL de la sección 1 se generó
-- con `prisma migrate diff` desde el schema. Después: `npx prisma generate`.
--
-- ⚠️ La sección 0 borra los destinos de retransmisión si ya existieran. No toca
-- transmisiones, invitaciones ni grabaciones (solo agrega columnas).
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS transmision_destinos CASCADE;
ALTER TABLE evento_transmisiones DROP CONSTRAINT IF EXISTS transmision_resumen_valido;
ALTER TABLE evento_transmisiones
  DROP COLUMN IF EXISTS aviso_resumen_en, DROP COLUMN IF EXISTS resumen, DROP COLUMN IF EXISTS resumen_estado,
  DROP COLUMN IF EXISTS resumen_generado_en, DROP COLUMN IF EXISTS resumen_intentos,
  DROP COLUMN IF EXISTS resumen_tokens_entrada, DROP COLUMN IF EXISTS resumen_tokens_salida;
ALTER TABLE transmision_grabaciones DROP CONSTRAINT IF EXISTS grabacion_subtitulos_valido;
ALTER TABLE transmision_grabaciones DROP COLUMN IF EXISTS subtitulos_estado;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "evento_transmisiones" ADD COLUMN     "aviso_resumen_en" TIMESTAMPTZ,
ADD COLUMN     "resumen" JSONB,
ADD COLUMN     "resumen_estado" VARCHAR(20),
ADD COLUMN     "resumen_generado_en" TIMESTAMPTZ,
ADD COLUMN     "resumen_intentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resumen_tokens_entrada" INTEGER,
ADD COLUMN     "resumen_tokens_salida" INTEGER;

-- AlterTable
ALTER TABLE "transmision_grabaciones" ADD COLUMN     "subtitulos_estado" VARCHAR(20) NOT NULL DEFAULT 'sin_pedir';

-- CreateTable
CREATE TABLE "transmision_destinos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "plataforma" VARCHAR(20) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "clave_cifrada" TEXT NOT NULL,
    "salida_id" VARCHAR(64),
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "transmision_destinos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transmision_destinos_transmision" ON "transmision_destinos"("transmision_id");

-- AddForeignKey
ALTER TABLE "transmision_destinos" ADD CONSTRAINT "transmision_destinos_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE evento_transmisiones
  ADD CONSTRAINT transmision_resumen_valido CHECK (resumen_estado IS NULL OR resumen_estado IN ('pendiente', 'generando', 'listo', 'error', 'sin_audio'));

ALTER TABLE transmision_grabaciones
  ADD CONSTRAINT grabacion_subtitulos_valido CHECK (subtitulos_estado IN ('sin_pedir', 'pendiente', 'listo', 'error'));

ALTER TABLE transmision_destinos
  ADD CONSTRAINT destino_plataforma_valida CHECK (plataforma IN ('facebook', 'youtube', 'otro'));

-- Premium se cobra como cargo manual (S/ 40 por evento, decisión 2026-10-09).
ALTER TABLE transmision_cargos DROP CONSTRAINT IF EXISTS cargo_tipo_valido;
ALTER TABLE transmision_cargos ADD CONSTRAINT cargo_tipo_valido CHECK (tipo IN ('guardar_anio', 'premium'));

-- 3) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
ALTER TABLE transmision_destinos ENABLE ROW LEVEL SECURITY;

COMMIT;
