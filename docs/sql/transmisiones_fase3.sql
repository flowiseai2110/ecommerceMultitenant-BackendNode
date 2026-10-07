-- ============================================================================
-- TRANSMISIÓN DE EVENTOS — Fase 3 (paquetes de horas, excedente y aviso de 15 min)
-- Spec: docs/specs/transmision-eventos (plan.md, Fase 3) · cobro MANUAL
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de transmisiones_fase2.sql, en el SQL Editor de Supabase.
-- Se puede correr más de una vez (sección 0). El DDL de la sección 1 se generó
-- con `prisma migrate diff` desde el schema. Después: `npx prisma generate`.
--
-- ⚠️ La sección 0 borra paquetes, movimientos y excedentes si ya existieran.
-- No toca transmisiones ni invitaciones (solo agrega columnas).
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
DROP TABLE IF EXISTS transmision_movimientos CASCADE;
DROP TABLE IF EXISTS transmision_excedentes  CASCADE;
DROP TABLE IF EXISTS transmision_paquetes    CASCADE;
ALTER TABLE evento_transmisiones DROP CONSTRAINT IF EXISTS transmision_extension_valida;
ALTER TABLE evento_transmisiones
  DROP COLUMN IF EXISTS extension_min, DROP COLUMN IF EXISTS extension_auto_max_min, DROP COLUMN IF EXISTS no_extender,
  DROP COLUMN IF EXISTS aviso_fin_en, DROP COLUMN IF EXISTS contacto_nombre, DROP COLUMN IF EXISTS contacto_email,
  DROP COLUMN IF EXISTS contacto_telefono, DROP COLUMN IF EXISTS minutos_vistos;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "evento_transmisiones" ADD COLUMN     "aviso_fin_en" TIMESTAMPTZ,
ADD COLUMN     "contacto_email" VARCHAR(150),
ADD COLUMN     "contacto_nombre" VARCHAR(100),
ADD COLUMN     "contacto_telefono" VARCHAR(20),
ADD COLUMN     "extension_auto_max_min" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extension_min" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minutos_vistos" DECIMAL(10,1) NOT NULL DEFAULT 0,
ADD COLUMN     "no_extender" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "transmision_paquetes" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "minutos" INTEGER NOT NULL,
    "minutos_usados" INTEGER NOT NULL DEFAULT 0,
    "precio" DECIMAL(10,2) NOT NULL,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'PEN',
    "referencia_pago" VARCHAR(120),
    "comprado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'activo',
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "transmision_paquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmision_movimientos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "fuente" VARCHAR(20) NOT NULL,
    "paquete_id" UUID,
    "periodo" VARCHAR(7) NOT NULL,
    "minutos" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmision_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmision_excedentes" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "transmision_id" UUID NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "minutos_autorizados" INTEGER NOT NULL,
    "minutos" INTEGER NOT NULL DEFAULT 0,
    "monto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'autorizado',
    "autorizado_por" VARCHAR(100) NOT NULL,
    "autorizado_en" TIMESTAMPTZ NOT NULL,
    "cobrado_en" TIMESTAMPTZ,
    "referencia_cobro" VARCHAR(120),
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "transmision_excedentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transmision_paquetes_tienda" ON "transmision_paquetes"("tienda_id", "vence_en");

-- CreateIndex
CREATE INDEX "idx_transmision_movimientos_tienda" ON "transmision_movimientos"("tienda_id", "periodo", "fuente");

-- CreateIndex
CREATE INDEX "idx_transmision_movimientos_transmision" ON "transmision_movimientos"("transmision_id");

-- CreateIndex
CREATE UNIQUE INDEX "transmision_excedentes_transmision_id_key" ON "transmision_excedentes"("transmision_id");

-- CreateIndex
CREATE INDEX "idx_transmision_excedentes_tienda" ON "transmision_excedentes"("tienda_id", "periodo", "estado");

-- AddForeignKey
ALTER TABLE "transmision_movimientos" ADD CONSTRAINT "transmision_movimientos_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmision_movimientos" ADD CONSTRAINT "transmision_movimientos_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "transmision_paquetes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmision_excedentes" ADD CONSTRAINT "transmision_excedentes_transmision_id_fkey" FOREIGN KEY ("transmision_id") REFERENCES "evento_transmisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE evento_transmisiones
  ADD CONSTRAINT transmision_extension_valida CHECK (extension_min BETWEEN 0 AND 180 AND extension_auto_max_min IN (0, 30, 60));

ALTER TABLE transmision_paquetes
  ADD CONSTRAINT paquete_minutos_validos CHECK (minutos > 0 AND minutos_usados BETWEEN 0 AND minutos),
  ADD CONSTRAINT paquete_estado_valido   CHECK (estado IN ('activo', 'anulado')),
  ADD CONSTRAINT paquete_precio_valido   CHECK (precio >= 0);

ALTER TABLE transmision_movimientos
  ADD CONSTRAINT movimiento_fuente_valida  CHECK (fuente IN ('plan', 'paquete', 'excedente', 'absorbido')),
  ADD CONSTRAINT movimiento_paquete        CHECK ((fuente = 'paquete') = (paquete_id IS NOT NULL)),
  ADD CONSTRAINT movimiento_minutos        CHECK (minutos > 0);

ALTER TABLE transmision_excedentes
  ADD CONSTRAINT excedente_estado_valido   CHECK (estado IN ('autorizado', 'por_cobrar', 'cobrado', 'anulado')),
  ADD CONSTRAINT excedente_minutos         CHECK (minutos >= 0 AND minutos_autorizados >= 0 AND monto >= 0);

-- 3) Sin acceso directo con la anon key (docs/sql/rls_hardening.sql) -----------
ALTER TABLE transmision_paquetes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmision_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmision_excedentes  ENABLE ROW LEVEL SECURITY;

COMMIT;
