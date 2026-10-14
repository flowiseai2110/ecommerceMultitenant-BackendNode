-- ============================================================================
-- MOTOR DE RESERVAS DEL HOTEL — M2 (cupo a la venta)
-- Spec: docs/specs/motor-reservas-hotel/spec.md
-- ----------------------------------------------------------------------------
-- Correr UNA vez en el SQL Editor de Supabase. Solo crea una tabla nueva: no
-- cambia nada de las tiendas existentes. La sección 1 se generó con
-- `prisma migrate diff`, así que es IDÉNTICA a lo que Prisma espera.
-- Después: `npx prisma generate`.
-- ============================================================================

BEGIN;

-- 1) Tabla (DDL exacto de Prisma) ----------------------------------------------
-- CreateTable
CREATE TABLE "hotel_cupo_externo" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "origen" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "ocupadas" INTEGER NOT NULL,
    "fecha_actualizacion" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "usuario_actualizacion" VARCHAR(100),

    CONSTRAINT "hotel_cupo_externo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hotel_cupo_externo_tienda_fecha" ON "hotel_cupo_externo"("tienda_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "uq_hotel_cupo_externo_noche" ON "hotel_cupo_externo"("producto_id", "fecha", "origen");

-- AddForeignKey
ALTER TABLE "hotel_cupo_externo" ADD CONSTRAINT "hotel_cupo_externo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "hotel_tipos_habitacion"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Reglas que Prisma no expresa ----------------------------------------------
ALTER TABLE "hotel_cupo_externo"
  ADD CONSTRAINT hotel_cupo_externo_origen   CHECK ("origen" IN ('manual', 'ical')),
  ADD CONSTRAINT hotel_cupo_externo_ocupadas CHECK ("ocupadas" > 0);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.hotel_cupo_externo ENABLE ROW LEVEL SECURITY;

COMMIT;
