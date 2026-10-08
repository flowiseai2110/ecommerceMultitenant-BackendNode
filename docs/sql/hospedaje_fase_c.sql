-- ============================================================================
-- HOSPEDAJE COMPLETO — Fase C (lo que el huésped espera)
-- Spec: docs/specs/hospedaje-completo (C1–C6) · Tareas: tasks.md fase C
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase, DESPUÉS de hospedaje_fase_b.sql.
-- Solo agrega columnas con valor por defecto y una tabla: no cambia el
-- comportamiento de las tiendas existentes. DDL igual al de `prisma migrate
-- diff` (mismos tipos y defaults). Después: `npx prisma generate`.
-- ============================================================================

-- 1) Tablas y columnas ---------------------------------------------------------
-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "idiomas" TEXT[] DEFAULT ARRAY['es']::TEXT[];

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "traducciones" JSONB;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "traducciones" JSONB;

-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "resenas_externas" JSONB,
ADD COLUMN     "tipo_cambio_usd" DECIMAL(6,3),
ADD COLUMN     "traducciones" JSONB;

-- AlterTable
ALTER TABLE "hotel_tipos_habitacion" ADD COLUMN     "traducciones" JSONB,
ADD COLUMN     "unidades" INTEGER;

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "habitaciones" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "idioma_huesped" VARCHAR(2) NOT NULL DEFAULT 'es',
ADD COLUMN     "plan" JSONB,
ADD COLUMN     "resena_pedida_en" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "hotel_temporadas" ADD COLUMN     "traducciones" JSONB;

-- AlterTable
ALTER TABLE "hotel_extras" ADD COLUMN     "traducciones" JSONB;

-- CreateTable
CREATE TABLE "hotel_planes" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(200),
    "ajuste_pct" INTEGER NOT NULL,
    "reembolsable" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "traducciones" JSONB,
    "fecha_registro" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_registro" VARCHAR(100),
    "fecha_actualizacion" TIMESTAMPTZ,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_planes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hotel_planes_tienda" ON "hotel_planes"("tienda_id");

-- AddForeignKey
ALTER TABLE "hotel_planes" ADD CONSTRAINT "hotel_planes_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE hotel_tipos_habitacion
  ADD CONSTRAINT habitacion_unidades CHECK (unidades IS NULL OR unidades BETWEEN 1 AND 500);

ALTER TABLE reservas
  ADD CONSTRAINT reservas_habitaciones CHECK (habitaciones BETWEEN 1 AND 20);

ALTER TABLE config_reservas
  ADD CONSTRAINT config_tipo_cambio CHECK (tipo_cambio_usd IS NULL OR tipo_cambio_usd > 0);

ALTER TABLE hotel_planes
  ADD CONSTRAINT plan_ajuste CHECK (ajuste_pct BETWEEN -50 AND 0);

ALTER TABLE tiendas
  ADD CONSTRAINT tiendas_idiomas CHECK (idiomas <@ ARRAY['es', 'en']::TEXT[] AND 'es' = ANY (idiomas));

-- Ocupación por tipo y fecha (C1): la consulta filtra por producto y estado.
CREATE INDEX IF NOT EXISTS idx_reservas_producto_inicio ON reservas (producto_id, inicio);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.hotel_planes ENABLE ROW LEVEL SECURITY;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT idiomas FROM tiendas LIMIT 3;
--   SELECT unidades FROM hotel_tipos_habitacion LIMIT 3;
