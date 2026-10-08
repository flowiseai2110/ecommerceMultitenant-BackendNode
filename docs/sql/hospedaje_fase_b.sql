-- ============================================================================
-- HOSPEDAJE COMPLETO — Fase B (lo que el dueño configura)
-- Spec: docs/specs/hospedaje-completo (B1–B6) · Tareas: tasks.md fase B
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. Solo agrega columnas con valor
-- por defecto y dos tablas nuevas: no cambia el comportamiento de las tiendas
-- existentes. El DDL (sección 1) se generó con `prisma migrate diff`, así que
-- es IDÉNTICO al que Prisma espera (sin drift). Después: `npx prisma generate`.
-- ============================================================================

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------
-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "cargo_nino_noche" DECIMAL(10,2),
ADD COLUMN     "exonera_igv_extranjeros" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ninos_gratis_hasta" INTEGER,
ADD COLUMN     "tipo_alojamiento" VARCHAR(12) NOT NULL DEFAULT 'hotel';

-- AlterTable
ALTER TABLE "hotel_tipos_habitacion" ADD COLUMN     "solo_mujeres" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "edades_ninos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "exonerado_igv" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extras" JSONB;

-- CreateTable
CREATE TABLE "hotel_temporadas" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "ajuste_pct" INTEGER NOT NULL,
    "min_noches" INTEGER,
    "producto_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_extras" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(200),
    "precio" DECIMAL(10,2) NOT NULL,
    "cobro" VARCHAR(14) NOT NULL DEFAULT 'estadia',
    "dato_pedido" VARCHAR(80),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hotel_temporadas_rango" ON "hotel_temporadas"("tienda_id", "desde", "hasta");

-- CreateIndex
CREATE INDEX "idx_hotel_extras_tienda" ON "hotel_extras"("tienda_id");

-- AddForeignKey
ALTER TABLE "hotel_temporadas" ADD CONSTRAINT "hotel_temporadas_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_extras" ADD CONSTRAINT "hotel_extras_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE config_reservas
  ADD CONSTRAINT config_tipo_alojamiento CHECK (tipo_alojamiento IN ('hotel', 'hostal', 'casa', 'apart', 'lodge', 'posada')),
  ADD CONSTRAINT config_ninos_gratis     CHECK (ninos_gratis_hasta IS NULL OR ninos_gratis_hasta BETWEEN 0 AND 17),
  ADD CONSTRAINT config_cargo_nino       CHECK (cargo_nino_noche IS NULL OR cargo_nino_noche >= 0);

ALTER TABLE hotel_temporadas
  ADD CONSTRAINT temporada_rango      CHECK (desde <= hasta),
  ADD CONSTRAINT temporada_ajuste     CHECK (ajuste_pct BETWEEN -50 AND 300),
  ADD CONSTRAINT temporada_min_noches CHECK (min_noches IS NULL OR min_noches BETWEEN 1 AND 30);

ALTER TABLE hotel_extras
  ADD CONSTRAINT extra_precio CHECK (precio >= 0),
  ADD CONSTRAINT extra_cobro  CHECK (cobro IN ('estadia', 'noche', 'persona', 'persona_noche'));

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.hotel_temporadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_extras     ENABLE ROW LEVEL SECURITY;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT tipo_alojamiento, exonera_igv_extranjeros FROM config_reservas LIMIT 5;
--   SELECT COUNT(*) FROM hotel_temporadas;
