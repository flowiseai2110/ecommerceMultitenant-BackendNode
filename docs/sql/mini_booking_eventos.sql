-- ============================================================================
-- MINI BOOKING — Fase 3 (eventos: compra de entradas con cupo)
-- Spec: docs/specs/mini-booking (R4, R9) · Tareas: tasks.md fase 3
-- ----------------------------------------------------------------------------
-- Correr DESPUÉS de mini_booking_setup.sql y mini_booking_tours.sql, en el SQL
-- Editor de Supabase. Se puede correr más de una vez: la sección 0 borra lo que
-- haya dejado un intento anterior (tablas, columnas y restricciones de eventos)
-- y la sección 1 lo vuelve a crear. El DDL de la sección 1 se generó con
-- `prisma migrate diff` desde el schema (sin drift). Después: `npx prisma generate`.
--
-- ⚠️ Borra los eventos, funciones, entradas y compras de entradas que existan.
-- No toca habitaciones, tours ni sus reservas.
--
-- Sin entradas con QR ni validación en la puerta (decisión 2026-10-05): la
-- compra confirmada es la constancia, y el organizador controla el ingreso con
-- la lista de asistentes de cada función.
-- ============================================================================

BEGIN;

-- 0) Limpieza de un intento anterior -------------------------------------------
-- Compras de entradas ya registradas (si las hubiera): sin sus tablas no tienen sentido.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reservas' AND column_name = 'funcion_id') THEN
    DELETE FROM pedidos WHERE tipo = 'evento';
  END IF;
END $$;

ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_evento_funcion;
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_funcion_id_fkey;
DROP INDEX IF EXISTS idx_reservas_funcion;
ALTER TABLE reservas DROP COLUMN IF EXISTS funcion_id;
ALTER TABLE reservas DROP COLUMN IF EXISTS apartado_hasta;

DROP TABLE IF EXISTS evento_compra_items  CASCADE;
DROP TABLE IF EXISTS evento_tipos_entrada CASCADE;
DROP TABLE IF EXISTS evento_funciones     CASCADE;
DROP TABLE IF EXISTS eventos              CASCADE;

ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_apartado_valido;
ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_max_entradas;
ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_umbral_ultimas;
ALTER TABLE config_reservas DROP CONSTRAINT IF EXISTS config_cierre_pago;
ALTER TABLE config_reservas DROP COLUMN IF EXISTS apartado_manual_min;
ALTER TABLE config_reservas DROP COLUMN IF EXISTS cierre_pago_manual_horas;
ALTER TABLE config_reservas DROP COLUMN IF EXISTS max_entradas_por_compra;
ALTER TABLE config_reservas DROP COLUMN IF EXISTS umbral_ultimas_entradas;

-- El CHECK de tipo se recrea en la sección 2 (con 'evento').
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_tipo_valido;

-- 1) Tablas y columnas (DDL exacto de Prisma) ----------------------------------

-- AlterTable
ALTER TABLE "config_reservas" ADD COLUMN     "apartado_manual_min" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "cierre_pago_manual_horas" INTEGER,
ADD COLUMN     "max_entradas_por_compra" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "umbral_ultimas_entradas" INTEGER DEFAULT 20;

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "apartado_hasta" TIMESTAMPTZ,
ADD COLUMN     "funcion_id" UUID,
ALTER COLUMN "tipo" SET DATA TYPE VARCHAR(10);

-- CreateTable
CREATE TABLE "eventos" (
    "producto_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "lugar" VARCHAR(150),
    "direccion" TEXT,
    "mapa_url" VARCHAR(500),
    "edad_minima" INTEGER,
    "organizador" VARCHAR(150),

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "evento_funciones" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "nombre" VARCHAR(80),
    "inicio" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "evento_funciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_tipos_entrada" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "funcion_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200),
    "precio" DECIMAL(10,2) NOT NULL,
    "cupo" INTEGER NOT NULL,
    "vendidos" INTEGER NOT NULL DEFAULT 0,
    "venta_hasta" TIMESTAMPTZ,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evento_tipos_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_compra_items" (
    "id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "tipo_entrada_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "evento_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_eventos_tienda" ON "eventos"("tienda_id");

-- CreateIndex
CREATE INDEX "idx_evento_funciones_evento" ON "evento_funciones"("producto_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_evento_funciones_tienda" ON "evento_funciones"("tienda_id", "inicio");

-- CreateIndex
CREATE INDEX "idx_evento_tipos_funcion" ON "evento_tipos_entrada"("funcion_id");

-- CreateIndex
CREATE INDEX "idx_evento_items_tipo" ON "evento_compra_items"("tipo_entrada_id");

-- CreateIndex
CREATE INDEX "idx_evento_items_pedido" ON "evento_compra_items"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_reservas_funcion" ON "reservas"("funcion_id");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "evento_funciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_funciones" ADD CONSTRAINT "evento_funciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "eventos"("producto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_tipos_entrada" ADD CONSTRAINT "evento_tipos_entrada_funcion_id_fkey" FOREIGN KEY ("funcion_id") REFERENCES "evento_funciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_compra_items" ADD CONSTRAINT "evento_compra_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_compra_items" ADD CONSTRAINT "evento_compra_items_tipo_entrada_id_fkey" FOREIGN KEY ("tipo_entrada_id") REFERENCES "evento_tipos_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 2) Reglas que Prisma no expresa --------------------------------------------
ALTER TABLE reservas
  ADD CONSTRAINT reservas_tipo_valido      CHECK (tipo IN ('hotel', 'tour', 'evento')),
  ADD CONSTRAINT reservas_evento_funcion   CHECK (tipo <> 'evento' OR funcion_id IS NOT NULL);

ALTER TABLE config_reservas
  ADD CONSTRAINT config_apartado_valido    CHECK (apartado_manual_min BETWEEN 10 AND 1440),
  ADD CONSTRAINT config_max_entradas       CHECK (max_entradas_por_compra BETWEEN 1 AND 50),
  ADD CONSTRAINT config_umbral_ultimas     CHECK (umbral_ultimas_entradas IS NULL OR umbral_ultimas_entradas BETWEEN 1 AND 1000),
  ADD CONSTRAINT config_cierre_pago        CHECK (cierre_pago_manual_horas IS NULL OR cierre_pago_manual_horas BETWEEN 1 AND 168);

ALTER TABLE eventos
  ADD CONSTRAINT eventos_edad_valida       CHECK (edad_minima IS NULL OR edad_minima BETWEEN 0 AND 99);

ALTER TABLE evento_funciones
  ADD CONSTRAINT evento_funcion_rango      CHECK (fin IS NULL OR fin > inicio);

-- El cupo nunca se sobrevende: la compra y la confirmación bloquean la fila (FOR UPDATE).
ALTER TABLE evento_tipos_entrada
  ADD CONSTRAINT evento_tipo_precio        CHECK (precio >= 0),
  ADD CONSTRAINT evento_tipo_cupo          CHECK (cupo >= 0 AND vendidos >= 0 AND vendidos <= cupo);

ALTER TABLE evento_compra_items
  ADD CONSTRAINT evento_item_cantidad      CHECK (cantidad > 0 AND precio >= 0);

-- 3) RLS sin políticas: solo el backend accede ---------------------------------
ALTER TABLE public.eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_funciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_tipos_entrada ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_compra_items  ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 4) Verificación (opcional) ---------------------------------------------------
--   SELECT conname FROM pg_constraint WHERE conname = 'reservas_tipo_valido';
--   SELECT COUNT(*) FROM evento_tipos_entrada WHERE vendidos > cupo;  -- 0
