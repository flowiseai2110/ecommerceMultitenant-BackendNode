-- ============================================================================
-- RECEPCIÓN — Fase 2 (caja por turno, controles y rol recepcionista)
-- Spec: docs/specs/recepcion/spec.md (R5, R6)
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, después de recepcion_fase_1.sql.
-- Agrega tablas y una columna nullable: no cambia nada de lo que ya existe.
-- La sección 1 se generó con `prisma migrate diff`. Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Tablas (DDL exacto de Prisma) ---------------------------------------------
-- AlterTable
ALTER TABLE "hotel_cobros" ADD COLUMN     "turno_id" UUID;

-- CreateTable
CREATE TABLE "hotel_turnos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "estado" VARCHAR(8) NOT NULL DEFAULT 'abierto',
    "abierto_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abierto_por" VARCHAR(100),
    "monto_inicial" DECIMAL(10,2) NOT NULL,
    "cerrado_en" TIMESTAMPTZ,
    "cerrado_por" VARCHAR(100),
    "efectivo_esperado" DECIMAL(10,2),
    "efectivo_contado" DECIMAL(10,2),
    "diferencia" DECIMAL(10,2),
    "nota" VARCHAR(300),
    "resumen" JSONB,

    CONSTRAINT "hotel_turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_caja_movimientos" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "tipo" VARCHAR(7) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "motivo" VARCHAR(150) NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" VARCHAR(100),

    CONSTRAINT "hotel_caja_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_incidencias" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "habitacion_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "nota" VARCHAR(200),
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" VARCHAR(100),
    "revisada_en" TIMESTAMPTZ,
    "revisada_por" VARCHAR(100),

    CONSTRAINT "hotel_incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hotel_turnos_tienda" ON "hotel_turnos"("tienda_id", "abierto_en");

-- CreateIndex
CREATE INDEX "idx_hotel_caja_mov_turno" ON "hotel_caja_movimientos"("turno_id");

-- CreateIndex
CREATE INDEX "idx_hotel_incidencias_tienda" ON "hotel_incidencias"("tienda_id", "fecha");

-- CreateIndex
CREATE INDEX "idx_hotel_cobros_turno" ON "hotel_cobros"("turno_id");

-- AddForeignKey
ALTER TABLE "hotel_cobros" ADD CONSTRAINT "hotel_cobros_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "hotel_turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_caja_movimientos" ADD CONSTRAINT "hotel_caja_movimientos_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "hotel_turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_incidencias" ADD CONSTRAINT "hotel_incidencias_habitacion_id_fkey" FOREIGN KEY ("habitacion_id") REFERENCES "hotel_habitaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa ----------------------------------------------
-- Un solo cajón por tienda: a lo más un turno abierto.
CREATE UNIQUE INDEX "uq_hotel_turnos_abierto" ON "hotel_turnos"("tienda_id") WHERE "estado" = 'abierto';

ALTER TABLE "hotel_turnos"
  ADD CONSTRAINT hotel_turno_estado  CHECK ("estado" IN ('abierto', 'cerrado')),
  ADD CONSTRAINT hotel_turno_inicial CHECK ("monto_inicial" >= 0),
  ADD CONSTRAINT hotel_turno_cierre  CHECK ("estado" = 'abierto' OR ("cerrado_en" IS NOT NULL AND "efectivo_contado" IS NOT NULL));

ALTER TABLE "hotel_caja_movimientos"
  ADD CONSTRAINT hotel_caja_mov_tipo  CHECK ("tipo" IN ('ingreso', 'egreso')),
  ADD CONSTRAINT hotel_caja_mov_monto CHECK ("monto" > 0);

ALTER TABLE "hotel_incidencias"
  ADD CONSTRAINT hotel_incidencia_tipo CHECK ("tipo" IN ('uso_sin_registrar'));

-- 3) Rol recepcionista (R6): solo Recepción y su caja --------------------------
-- `id` no tiene default en la base (Prisma lo genera en la app): se da aquí.
INSERT INTO enumerados (id, tipo, codigo, valor, descripcion, orden, color, icono, metadata) VALUES
(gen_random_uuid(), 'rol_usuario', 'recepcionista', 'Recepcionista', 'Solo opera Recepción: entradas, salidas y su caja', 5, '#F59E0B', 'key', '{"permisos": ["recepcion"]}')
ON CONFLICT (tipo, codigo) DO NOTHING;

-- 4) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.hotel_turnos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_incidencias      ENABLE ROW LEVEL SECURITY;

COMMIT;
