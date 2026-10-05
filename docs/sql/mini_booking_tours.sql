-- ============================================================================
-- MINI BOOKING — Fase 2 (agencia de tours)
-- Spec: docs/specs/mini-booking (R3, R5) · Tareas: tasks.md fase 2
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de mini_booking_setup.sql, UNA vez, en el SQL Editor de
-- Supabase. El DDL (sección 1) se generó con `prisma migrate diff` desde el
-- schema, así que es IDÉNTICO al que Prisma espera (sin drift).
-- Después: `npx prisma generate`.
-- ============================================================================

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------
-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "idioma" VARCHAR(5);

-- CreateTable
CREATE TABLE "tours" (
    "producto_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "duracion" VARCHAR(50),
    "duracion_horas" INTEGER,
    "dias_salida" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "horas_salida" TEXT[],
    "idiomas" TEXT[] DEFAULT ARRAY['es']::TEXT[],
    "itinerario" JSONB,
    "incluye" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "no_incluye" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "que_llevar" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requisitos" TEXT,
    "punto_encuentro" TEXT,
    "recojo" TEXT,
    "edad_minima" INTEGER,
    "max_pasajeros" INTEGER,

    CONSTRAINT "tours_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "tour_tipos_pasajero" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tour_tipos_pasajero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tours_tienda" ON "tours"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_tour_tipos_producto" ON "tour_tipos_pasajero"("producto_id");

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_tipos_pasajero" ADD CONSTRAINT "tour_tipos_pasajero_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "tours"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE tours
  ADD CONSTRAINT tours_dias_validos      CHECK (dias_salida <@ ARRAY[1, 2, 3, 4, 5, 6, 7] AND cardinality(dias_salida) >= 1),
  ADD CONSTRAINT tours_horas_validas     CHECK (cardinality(horas_salida) >= 1
                                                AND array_to_string(horas_salida, ',') ~ '^(([01]\d|2[0-3]):[0-5]\d)(,([01]\d|2[0-3]):[0-5]\d)*$'),
  ADD CONSTRAINT tours_duracion_valida   CHECK (duracion_horas IS NULL OR duracion_horas BETWEEN 1 AND 720),
  ADD CONSTRAINT tours_edad_valida       CHECK (edad_minima IS NULL OR edad_minima BETWEEN 0 AND 99),
  ADD CONSTRAINT tours_max_pax_valido    CHECK (max_pasajeros IS NULL OR max_pasajeros BETWEEN 1 AND 200);

ALTER TABLE tour_tipos_pasajero
  ADD CONSTRAINT tour_tipo_precio CHECK (precio >= 0);

ALTER TABLE reservas
  ADD CONSTRAINT reservas_tour_pasajeros CHECK (tipo <> 'tour' OR pasajeros IS NOT NULL);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.tours               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_tipos_pasajero ENABLE ROW LEVEL SECURITY;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT COUNT(*) FROM tours;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'reservas' AND column_name = 'idioma';
