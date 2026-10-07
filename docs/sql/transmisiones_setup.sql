-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Fase 1 (evento privado, transmisión Básica e invitaciones)
-- Spec: docs/specs/transmision-eventos (spec.md, plan.md)
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de mini_booking_eventos.sql, en el SQL Editor de Supabase.
-- Se puede correr más de una vez: la sección 0 borra lo que haya dejado un
-- intento anterior y la sección 1 lo vuelve a crear. El DDL de la sección 1 se
-- generó con `prisma migrate diff` desde el schema. Después: `npx prisma generate`.
--
-- ⚠️ Borra las transmisiones y sus invitaciones si ya existieran. No toca
-- eventos, funciones, entradas ni compras (solo agrega la columna `privado`).
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS evento_invitaciones  CASCADE;
DROP TABLE IF EXISTS evento_transmisiones CASCADE;
ALTER TABLE eventos DROP COLUMN IF EXISTS privado;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "eventos" ADD COLUMN     "privado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "evento_transmisiones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "plan" VARCHAR(20) NOT NULL DEFAULT 'basico',
    "estado" VARCHAR(20) NOT NULL DEFAULT 'programada',
    "duracion_min" INTEGER NOT NULL,
    "youtube_video_id" VARCHAR(20),
    "anfitrion_nombre" VARCHAR(150) NOT NULL,
    "anfitrion_email" VARCHAR(150),
    "consentimiento_en" TIMESTAMPTZ NOT NULL,
    "consentimiento_por" VARCHAR(100) NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "evento_transmisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_invitaciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(20),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'activa',
    "version" INTEGER NOT NULL DEFAULT 1,
    "primera_conexion_en" TIMESTAMPTZ,
    "ultima_conexion_en" TIMESTAMPTZ,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "evento_invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evento_transmisiones_funcion_id_key" ON "evento_transmisiones"("funcion_id");

-- CreateIndex
CREATE INDEX "idx_evento_transmisiones_tienda" ON "evento_transmisiones"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_evento_invitaciones_transmision" ON "evento_invitaciones"("transmision_id");

-- CreateIndex
CREATE INDEX "idx_evento_invitaciones_tienda" ON "evento_invitaciones"("tienda_id");

-- AddForeignKey
ALTER TABLE "evento_transmisiones" ADD CONSTRAINT "evento_transmisiones_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "evento_funciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_invitaciones" ADD CONSTRAINT "evento_invitaciones_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE evento_transmisiones
  ADD CONSTRAINT transmision_plan_valido    CHECK (plan IN ('basico', 'privado', 'premium')),
  ADD CONSTRAINT transmision_estado_valido  CHECK (estado IN ('programada', 'cancelada')),
  ADD CONSTRAINT transmision_duracion       CHECK (duracion_min BETWEEN 15 AND 720),
  ADD CONSTRAINT transmision_basico_youtube CHECK (plan <> 'basico' OR youtube_video_id IS NOT NULL);

ALTER TABLE evento_invitaciones
  ADD CONSTRAINT invitacion_estado_valido  CHECK (estado IN ('activa', 'anulada')),
  ADD CONSTRAINT invitacion_version_valida CHECK (version >= 1);

-- 3) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
-- El backend (rol postgres, dueño) no se ve afectado. Sin políticas: nadie más lee.
ALTER TABLE evento_transmisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_invitaciones  ENABLE ROW LEVEL SECURITY;

COMMIT;
